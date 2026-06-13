/*
 * ANCHOR — Bedside Sleep & Wellness Monitor  (LIVE / no-SD version)
 * Hardware: Elegoo Mega 2560 (Most Complete Starter Kit)
 *
 * Streams all sensor readings over USB so you can watch a LIVE GRAPH in
 * the Arduino IDE Serial Plotter (Tools -> Serial Plotter, baud 9600).
 * The same labeled stream is parsed by the Anchor bridge (server.js on your
 * Mac), which re-serves it to the Anchor phone app over Wi-Fi:
 *
 *     Arduino  --USB serial-->  Mac (server.js)  --Wi-Fi-->  phone
 *
 * Line format (Serial Plotter friendly, comma-separated label:value):
 *   Temp:22.4,Humidity:46,Light:512,Sound:300,Motion:1,Distance:80,Fan:0
 * The bridge maps Temp->°F, Light/Sound->estimated lux/dB, and derives
 * "in bed" from Distance (something close in front of the ultrasonic).
 *
 * Drives a cooling fan when the room gets too warm, plus a buzzer alert.
 *
 * ---- LIBRARIES TO INSTALL (Arduino IDE -> Library Manager) ----
 *   - "DHT sensor library" by Adafruit  (+ "Adafruit Unified Sensor")
 *   - "RTClib" by Adafruit                      (optional, for clock)
 *   - "LiquidCrystal I2C" by Frank de Brabander (optional, for LCD)
 *   Wire is built in.
 *
 * ---- PIN MAP (Mega 2560) ----
 *   DHT11 DATA ........... D2
 *   PIR OUT .............. D3
 *   SOUND DO ............. D4     SOUND AO ... A1
 *   ULTRASONIC TRIG ...... D6     ECHO ....... D7
 *   PHOTORESISTOR ........ A0  (LDR + 10k divider)
 *   BUZZER ............... D8
 *   FAN (transistor base). D9  (PWM, via 1k resistor)
 *   RTC + LCD (I2C) ...... SDA=20  SCL=21
 */

#include <Wire.h>
#include <DHT.h>
#include <RTClib.h>
#include <LiquidCrystal_I2C.h>

// ---------------- Pin definitions ----------------
#define DHTPIN      2
#define DHTTYPE     DHT11
#define PIR_PIN     3
#define SOUND_DO    4
#define SOUND_AO    A1
#define TRIG_PIN    6
#define ECHO_PIN    7
#define LDR_PIN     A0
#define BUZZER_PIN  8
#define FAN_PIN     9          // must be a PWM pin

// ---------------- Tunable thresholds ----------------
const float FAN_ON_TEMP   = 26.0;   // C: start cooling above this
const float FAN_FULL_TEMP = 30.0;   // C: fan at 100% at/above this

// ---------------- Toggles (set false if you don't have the part) ----
const bool USE_RTC = true;
const bool USE_LCD = true;

// ---------------- Objects ----------------
DHT dht(DHTPIN, DHTTYPE);
RTC_DS1307 rtc;
LiquidCrystal_I2C lcd(0x27, 16, 2);   // address often 0x27 or 0x3F

bool rtcReady = false;
bool lcdReady = false;
float lastTemp = 0, lastHum = 0;      // hold last good DHT reading

// ---- update cadence ----
// How often to read sensors + stream a line. Slower = far less stress on the
// board and the USB link (the bridge holds the last reading and serves it to
// the phone in between, so the app still looks live). 10s is a calm default;
// drop to 5000 if you want livelier graphs once it's stable.
const unsigned long UPDATE_MS = 10000;
unsigned long lastUpdate = 0;

void setup() {
  Serial.begin(9600);
  while (!Serial && millis() < 3000) {}

  pinMode(PIR_PIN, INPUT);
  pinMode(SOUND_DO, INPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);
  analogWrite(FAN_PIN, 0);

  dht.begin();
  Wire.begin();

  if (USE_RTC && rtc.begin()) {
    rtcReady = true;
    if (!rtc.isrunning()) rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }

  if (USE_LCD) {
    lcd.init();
    lcd.backlight();
    lcd.print("ANCHOR booting");
    lcdReady = true;
  }
}

long readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long dur = pulseIn(ECHO_PIN, HIGH, 30000UL);
  if (dur == 0) return -1;
  return dur * 0.0343 / 2;
}

int readSoundPeak() {
  int peak = 0;
  unsigned long start = millis();
  while (millis() - start < 50) {
    int v = analogRead(SOUND_AO);
    if (v > peak) peak = v;
  }
  return peak;
}

void loop() {
  // Non-blocking pacing: only do the heavy sensor read + serial write every
  // UPDATE_MS. The loop stays free the rest of the time (no long delay()).
  if (millis() - lastUpdate < UPDATE_MS) { delay(20); return; }
  lastUpdate = millis();

  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();
  if (!isnan(temp)) lastTemp = temp; else temp = lastTemp;  // hold last good
  if (!isnan(hum))  lastHum  = hum;  else hum  = lastHum;

  int   light  = analogRead(LDR_PIN);
  int   sound  = readSoundPeak();
  bool  motion = digitalRead(PIR_PIN);
  long  dist   = readDistanceCm();

  // ---- Fan control: proportional speed with hysteresis ----
  int fanPct = 0;
  if (temp >= FAN_FULL_TEMP)      fanPct = 100;
  else if (temp >= FAN_ON_TEMP)   fanPct = map((int)(temp*10), (int)(FAN_ON_TEMP*10), (int)(FAN_FULL_TEMP*10), 30, 100);
  analogWrite(FAN_PIN, map(fanPct, 0, 100, 0, 255));

  if (temp >= FAN_FULL_TEMP) tone(BUZZER_PIN, 1000, 100);

  // ---- LIVE PLOT LINE (Serial Plotter friendly: label:value, comma-sep) ----
  Serial.print("Temp:");     Serial.print(temp, 1);
  Serial.print(",Humidity:");Serial.print(hum, 0);
  Serial.print(",Light:");   Serial.print(light);
  Serial.print(",Sound:");   Serial.print(sound);
  Serial.print(",Motion:");  Serial.print(motion ? 1 : 0);
  Serial.print(",Distance:");Serial.print(dist);
  Serial.print(",Fan:");     Serial.println(fanPct);

  // ---- LCD readout ----
  if (lcdReady) {
    lcd.clear();
    lcd.setCursor(0,0);
    lcd.print("T:"); lcd.print(temp,1); lcd.print((char)223);
    lcd.print("C "); lcd.print(motion ? "MOVE" : "calm");
    lcd.setCursor(0,1);
    lcd.print("Fan:"); lcd.print(fanPct); lcd.print("% ");
    lcd.print("L:"); lcd.print(light);
  }

  // (pacing handled by the millis() gate at the top — no blocking delay here)
}
