/**
 * The examples that come with ArduinoIDE4LilOS (written for it): opening one makes a new sketch with its
 * text in ~/Arduino. Library examples come from the kernel (libExample).
 */
export const EXAMPLES = [
  {
    id: 'Blink',
    text: `// Blink: the board's LED goes on and off every second.

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);   // the LED on the board (pin 13 on Uno, Nano and Mega)
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}
`,
  },
  {
    id: 'Fade',
    text: `// Fade: an LED on pin 9 (with a 220 ohm resistor) slowly brightens and dims.

const int LED = 9;   // a PWM pin (marked ~)
int level = 0;
int step = 5;

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  analogWrite(LED, level);
  level += step;
  if (level <= 0 || level >= 255) step = -step;
  delay(30);
}
`,
  },
  {
    id: 'Button',
    text: `// Button: a push button between pin 2 and GND turns the board's LED on.

const int BUTTON = 2;

void setup() {
  pinMode(BUTTON, INPUT_PULLUP);   // pressed = LOW
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  bool pressed = digitalRead(BUTTON) == LOW;
  digitalWrite(LED_BUILTIN, pressed ? HIGH : LOW);
}
`,
  },
  {
    id: 'AnalogReadSerial',
    text: `// AnalogReadSerial: the value of pin A0 (0-1023) in the serial monitor, ten times a second.
// Try a potentiometer: middle leg to A0, the others to 5V and GND.

void setup() {
  Serial.begin(9600);
}

void loop() {
  int value = analogRead(A0);
  Serial.println(value);
  delay(100);
}
`,
  },
  {
    id: 'SerialEcho',
    text: `// SerialEcho: what you send from the serial monitor comes back, in capitals.

void setup() {
  Serial.begin(9600);
  Serial.println("Ready: write something and press Enter");
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\\n');
    line.trim();
    line.toUpperCase();
    Serial.print("> ");
    Serial.println(line);
  }
}
`,
  },
];
