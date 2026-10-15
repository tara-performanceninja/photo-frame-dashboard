package com.wesbos.homehq;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.SystemClock;
import android.text.InputType;
import android.util.Log;
import android.widget.EditText;
import android.widget.CheckBox;
import android.widget.ScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Android light listener. No temperature access, root commands or TEAMTRI bridge. */
final class FrameLight implements SensorEventListener {
  private final Activity owner;
  private final LifeShell shell;
  private final SensorManager manager;
  private final Sensor sensor;
  private final SharedPreferences prefs;
  private final LightPolicy policy = new LightPolicy();
  private boolean enabled;
  private float reading = Float.NaN;
  private long lastSample;
  private TextView live;

  FrameLight(Activity activity, LifeShell life) {
    owner = activity; shell = life;
    manager = (SensorManager) activity.getSystemService(Context.SENSOR_SERVICE);
    sensor = manager.getDefaultSensor(Sensor.TYPE_LIGHT);
    prefs = activity.getSharedPreferences("frame_light", Context.MODE_PRIVATE);
    policy.dark = prefs.getFloat("dark", 10);
    policy.light = prefs.getFloat("light", 15);
    enabled = prefs.getBoolean("enabled", true);
    policy.darkDelay = prefs.getLong("dark_delay", 20000);
    policy.lightDelay = prefs.getLong("light_delay", 3000);
    policy.touchDelay = prefs.getLong("touch_delay", 60000);
  }
  void start() {
    policy.reset(); lastSample = 0;
    boolean active = sensor != null && manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL);
    Log.i("FrameLight", "listener active=" + active + " dark=" + policy.dark + " light=" + policy.light);
  }
  void stop() { manager.unregisterListener(this); policy.reset(); }
  void manual() {
    boolean wasDark = policy.darkness;
    policy.manual(SystemClock.elapsedRealtime());
    if (wasDark || shell.isDimmed()) shell.select("today");
  }
  @Override public void onSensorChanged(SensorEvent event) {
    reading = event.values[0];
    long now = SystemClock.elapsedRealtime();
    // Never count a delivery gap as sustained darkness/light.
    if (lastSample != 0 && now - lastSample > 5000) policy.reset();
    lastSample = now;
    if (live != null) live.setText(description());
    if (!enabled) return;
    int action = policy.sample(reading, now);
    if (action == LightPolicy.DARK) {
      Log.i("FrameLight", "dark screen saver reading=" + reading);
      shell.showDarkAmbient();
    } else if (action == LightPolicy.LIGHT) {
      Log.i("FrameLight", "light return reading=" + reading);
      shell.select("today");
    }
  }
  @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }
  private String description() {
    return "Current light: " + (Float.isNaN(reading) ? "waiting for sensor" : String.valueOf(reading))
        + "\nDark for " + policy.darkDelay / 1000 + " seconds. Light for " + policy.lightDelay / 1000
        + " seconds.\nTouch returns for at least " + policy.touchDelay / 1000 + " seconds.";
  }
  void settings() {
    LinearLayout layout = new LinearLayout(owner);
    layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(24, 12, 24, 12);
    live = new TextView(owner); live.setText(description()); layout.addView(live);
    final CheckBox automatic = new CheckBox(owner); automatic.setText("Automatic light switching");
    automatic.setChecked(enabled); layout.addView(automatic);
    final EditText dark = field(layout, "Dark at or below", policy.dark);
    final EditText light = field(layout, "Light at or above", policy.light);
    final EditText darkDelay = field(layout, "Dark delay (seconds, 1-600)", policy.darkDelay / 1000);
    final EditText lightDelay = field(layout, "Light delay (seconds, 1-600)", policy.lightDelay / 1000);
    final EditText touchDelay = field(layout, "Touch override (seconds, 1-600)", policy.touchDelay / 1000);
    ScrollView scroll = new ScrollView(owner); scroll.addView(layout);
    final AlertDialog dialog = new AlertDialog.Builder(owner).setTitle("Light control")
        .setView(scroll).setPositiveButton("Save", null).setNegativeButton("Cancel", null).create();
    dialog.setOnDismissListener(d -> live = null);
    dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
      try {
        float a = Float.parseFloat(dark.getText().toString()), b = Float.parseFloat(light.getText().toString());
        if (Float.isNaN(a) || Float.isInfinite(a) || Float.isNaN(b) || Float.isInfinite(b) || a < 0 || b <= a) throw new NumberFormatException();
        long ds = seconds(darkDelay), ls = seconds(lightDelay), ts = seconds(touchDelay);
        enabled = automatic.isChecked();
        policy.darkDelay = ds; policy.lightDelay = ls; policy.touchDelay = ts;
        if (policy.darkness) shell.select("today");
        policy.dark = a; policy.light = b; policy.manual(SystemClock.elapsedRealtime());
        prefs.edit().putFloat("dark", a).putFloat("light", b).putBoolean("enabled", enabled)
            .putLong("dark_delay", ds).putLong("light_delay", ls).putLong("touch_delay", ts).apply();
        dialog.dismiss();
      } catch (NumberFormatException e) { light.setError("Light must exceed dark. Use non-negative cutoffs and whole delays from 1 to 600 seconds."); }
    }));
    dialog.show();
  }
  private long seconds(EditText input) {
    double n = Double.parseDouble(input.getText().toString());
    if (Double.isNaN(n) || n < 1 || n > 600 || n != Math.floor(n)) throw new NumberFormatException();
    return (long)n * 1000;
  }
  String status() { return description() + "\nAutomatic switching: " + (enabled ? "on" : "off"); }
  private EditText field(LinearLayout parent, String label, float value) {
    TextView text = new TextView(owner); text.setText(label); parent.addView(text);
    EditText input = new EditText(owner); input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    input.setText(String.valueOf(value)); parent.addView(input); return input;
  }
}
