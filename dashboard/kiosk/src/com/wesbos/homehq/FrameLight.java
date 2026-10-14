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
  private float reading = Float.NaN;
  private long lastSample;
  private TextView live;

  FrameLight(Activity activity, LifeShell life) {
    owner = activity; shell = life;
    manager = (SensorManager) activity.getSystemService(Context.SENSOR_SERVICE);
    sensor = manager.getDefaultSensor(Sensor.TYPE_LIGHT);
    prefs = activity.getSharedPreferences("frame_light", Context.MODE_PRIVATE);
    policy.dark = prefs.getFloat("dark", 45);
    policy.light = prefs.getFloat("light", 55);
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
    if (wasDark) shell.select("today");
  }
  @Override public void onSensorChanged(SensorEvent event) {
    reading = event.values[0];
    long now = SystemClock.elapsedRealtime();
    // Never count a delivery gap as sustained darkness/light.
    if (lastSample != 0 && now - lastSample > 5000) policy.reset();
    lastSample = now;
    if (live != null) live.setText(description());
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
        + "\nDark for 20 seconds. Light for 3 seconds.\nTouch returns for at least 60 seconds.";
  }
  void settings() {
    LinearLayout layout = new LinearLayout(owner);
    layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(24, 12, 24, 12);
    live = new TextView(owner); live.setText(description()); layout.addView(live);
    final EditText dark = field(layout, "Dark at or below", policy.dark);
    final EditText light = field(layout, "Light at or above", policy.light);
    final AlertDialog dialog = new AlertDialog.Builder(owner).setTitle("Light control")
        .setView(layout).setPositiveButton("Save", null).setNegativeButton("Cancel", null).create();
    dialog.setOnDismissListener(d -> live = null);
    dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
      try {
        float a = Float.parseFloat(dark.getText().toString()), b = Float.parseFloat(light.getText().toString());
        if (Float.isNaN(a) || Float.isInfinite(a) || Float.isNaN(b) || Float.isInfinite(b) || a < 0 || b <= a) throw new NumberFormatException();
        policy.dark = a; policy.light = b; policy.manual(SystemClock.elapsedRealtime());
        prefs.edit().putFloat("dark", a).putFloat("light", b).apply();
        dialog.dismiss();
      } catch (NumberFormatException e) { light.setError("Use two numbers. Light must be above dark, and dark at least zero."); }
    }));
    dialog.show();
  }
  private EditText field(LinearLayout parent, String label, float value) {
    TextView text = new TextView(owner); text.setText(label); parent.addView(text);
    EditText input = new EditText(owner); input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    input.setText(String.valueOf(value)); parent.addView(input); return input;
  }
}
