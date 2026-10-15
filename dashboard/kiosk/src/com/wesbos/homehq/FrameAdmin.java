package com.wesbos.homehq;

import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.StatFs;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Physical-device admin only. Privileged actions never cross a web bridge. */
final class FrameAdmin {
  private final MainActivity owner;
  private final WebView web;
  private final LifeShell shell;
  private final FrameLight light;
  private final SharedPreferences prefs;
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private String maintenance = "Checking wireless ADB...";
  private boolean busy;
  private boolean closed;

  FrameAdmin(MainActivity owner, WebView web, LifeShell shell, FrameLight light) {
    this.owner = owner; this.web = web; this.shell = shell; this.light = light;
    prefs = owner.getSharedPreferences("frame_admin", Context.MODE_PRIVATE);
  }
  void start() {
    applyBrightness(owner, false);
    web.getSettings().setTextZoom(prefs.getInt("text_size", 100));
    // Every fresh app process/activity starts closed. Closing the panel alone does not close ADB.
    command(() -> { WirelessAdb.setEnabled(false); return "Wireless ADB is off"; }, null);
  }
  static void applyBrightness(android.app.Activity owner, boolean night) {
    SharedPreferences p = owner.getSharedPreferences("frame_admin", 0);
    WindowManager.LayoutParams w = owner.getWindow().getAttributes();
    w.screenBrightness = p.getInt(night ? "night_brightness" : "brightness", night ? 8 : 100) / 100f;
    owner.getWindow().setAttributes(w);
  }
  void show() {
    new AlertDialog.Builder(owner).setTitle("Frame settings")
        .setItems(new String[]{"Display", "Light control", "Dashboard", "Wi-Fi and network", "Health and status", "Maintenance", "Android settings", "Open launcher"}, (d, n) -> {
          switch(n) {
            case 0: display(); break;
            case 1: if (light != null) light.settings(); break;
            case 2: dashboard(); break;
            case 3: network(); break;
            case 4: health(); break;
            case 5: maintenance(); break;
            case 6: settings(Settings.ACTION_SETTINGS); break;
            case 7: owner.openLauncher(); break;
          }
        }).setNegativeButton("Back to dashboard", null).show();
  }
  private LinearLayout column() {
    LinearLayout box = new LinearLayout(owner); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(24,16,24,16); return box;
  }
  private TextView text(LinearLayout box, String label) {
    TextView view = new TextView(owner); view.setText(label); view.setTextSize(18); view.setPadding(0,8,0,8); box.addView(view); return view;
  }
  private void panel(String title, LinearLayout box) {
    ScrollView scroll = new ScrollView(owner); scroll.addView(box);
    new AlertDialog.Builder(owner).setTitle(title).setView(scroll).setPositiveButton("Done",null).setOnDismissListener(d->applyBrightness(owner,shell!=null && shell.isDimmed())).show();
  }
  private void slider(LinearLayout box, String label, String key, int fallback, int min, int max, Runnable changed) {
    TextView value = text(box, label + ": " + prefs.getInt(key, fallback) + "%");
    SeekBar seek = new SeekBar(owner); seek.setMax(max-min); seek.setProgress(prefs.getInt(key,fallback)-min); box.addView(seek);
    seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
      public void onProgressChanged(SeekBar s,int n,boolean user) {
        if (!user) return;
        prefs.edit().putInt(key,n+min).apply(); value.setText(label+": "+(n+min)+"%"); changed.run();
      }
      public void onStartTrackingTouch(SeekBar s) { }
      public void onStopTrackingTouch(SeekBar s) { }
    });
  }
  private void display() {
    LinearLayout box=column(); text(box,"Brightness changes save immediately. Minimum 5% keeps the controls visible.");
    slider(box,"Dashboard brightness","brightness",100,5,100,()->applyBrightness(owner,false));
    slider(box,"Clock / night brightness","night_brightness",8,5,100,()->applyBrightness(owner,true));
    panel("Display",box);
  }
  private void dashboard() {
    new AlertDialog.Builder(owner).setTitle("Dashboard")
      .setItems(new String[]{"Show Today", "Show TEAMTRI", "Show clock now", "Reload all dashboard pages", "Default tab on startup", "Text size", "Reset text size to 100%"},(d,n)->{
        if(n==0 && shell!=null) shell.select("today");
        if(n==1 && shell!=null) shell.select("teamtri");
        if(n==2 && shell!=null) shell.clock();
        if(n==3) { if(shell!=null) shell.reload(); else web.reload(); }
        if(n==4) new AlertDialog.Builder(owner).setTitle("Default tab on startup")
          .setSingleChoiceItems(new String[]{"Today","TEAMTRI"},"teamtri".equals(prefs.getString("tab","today"))?1:0,(x,i)->{prefs.edit().putString("tab",i==1?"teamtri":"today").apply();x.dismiss();}).setNegativeButton("Cancel",null).show();
        if(n==5) { LinearLayout box=column();slider(box,"Text size","text_size",100,75,150,()->size());panel("Dashboard text size",box); }
        if(n==6) { prefs.edit().putInt("text_size",100).apply();size(); }
      }).setNegativeButton("Back",(d,n)->show()).show();
  }
  private void size() { int n=prefs.getInt("text_size",100);web.getSettings().setTextZoom(n);if(shell!=null)shell.setTextSize(n); }
  private String addresses() {
    StringBuilder value=new StringBuilder();
    try {
      for(NetworkInterface ni:Collections.list(NetworkInterface.getNetworkInterfaces()))
        for(InetAddress ip:Collections.list(ni.getInetAddresses()))
          if(!ip.isLoopbackAddress() && ip.getAddress().length==4) value.append(ni.getName()).append(": ").append(ip.getHostAddress()).append("\n");
    } catch(Exception e) { return "Network details unavailable"; }
    return value.length()==0?"No IPv4 connection":value.toString().trim();
  }
  private void network() {
    new AlertDialog.Builder(owner).setTitle("Wi-Fi and network").setMessage(addresses()+"\n\nWireless ADB, when enabled: use this address with port 5555.\nThe dashboard needs this home network to reach its local server.")
      .setPositiveButton("Wi-Fi settings",(d,n)->settings(Settings.ACTION_WIFI_SETTINGS))
      .setNeutralButton("Refresh",(d,n)->network()).setNegativeButton("Done",null).show();
  }
  private void health() {
    String version="unknown";try{version=owner.getPackageManager().getPackageInfo(owner.getPackageName(),0).versionName;}catch(Exception ignored){}
    StatFs disk=new StatFs(owner.getFilesDir().getPath());
    LinearLayout box=column();text(box,"Frame admin: 15 October 2026\nHome HQ "+version+"\nAndroid "+Build.VERSION.RELEASE+"\nDevice: "+Build.MODEL
      +"\nUptime: "+(SystemClock.elapsedRealtime()/60000)+" minutes\nFree app storage: "+(disk.getAvailableBytes()/1048576)+" MB\n"+addresses()
      +"\n\n"+(light==null?"Light control unavailable":light.status())+"\n\n"+maintenance
      +"\n\nThis is device health, not proof that each dashboard data source has refreshed.");panel("Health and status",box);
  }
  private void settings(String action) {
    try { owner.startActivity(new Intent(action)); }catch(Exception e){message("Settings unavailable","This device does not provide that settings screen.");}
  }
  private void maintenance() {
    LinearLayout box=column();
    final CheckBox adb=new CheckBox(owner);adb.setText("Enable wireless ADB temporarily (30 minutes)");adb.setEnabled(false);box.addView(adb);
    final TextView state=text(box,"Checking actual port status...");
    text(box,"Off by default on app startup and after reboot. You can leave this panel while connected.\n\nWarning: this frame has no ADB authentication. While enabled, anyone who can reach the frame on the network may control it. Use only on your trusted home Wi-Fi. Turning it off closes existing Wi-Fi ADB connections.");
    final AlertDialog dialog=new AlertDialog.Builder(owner).setTitle("Maintenance").setView(box)
      .setPositiveButton("Done",null).setNeutralButton("More tools",(d,n)->tools()).create();
    worker.execute(()->{
      try { boolean on=WirelessAdb.listening();owner.runOnUiThread(()->{if(!dialog.isShowing())return;adb.setChecked(on);adb.setEnabled(!busy);state.setText(on?"Wireless ADB OPEN on port 5555\n"+addresses():"Wireless ADB is off");}); }
      catch(Exception e){owner.runOnUiThread(()->{state.setText("Could not read port status. Use Close wireless ADB below.");});}
    });
    adb.setOnClickListener(button->{
      boolean on=adb.isChecked();
      adb.setChecked(!on);
      if(on) new AlertDialog.Builder(owner).setTitle("Open unauthenticated ADB?")
        .setMessage("This grants powerful Android access to reachable devices for up to 30 minutes. Only do this on trusted home Wi-Fi.")
        .setPositiveButton("Enable for 30 minutes",(d,n)->toggle(true,adb,state))
        .setNegativeButton("Cancel",null).show();
      else toggle(false,adb,state);
    });
    android.os.Handler refresh = new android.os.Handler(android.os.Looper.getMainLooper());
    Runnable poll = new Runnable() { public void run() {
      if (!dialog.isShowing() || closed) return;
      if (!busy) worker.execute(()->{
        try { boolean on=WirelessAdb.listening();owner.runOnUiThread(()->{
          if(!dialog.isShowing() || busy)return;
          adb.setChecked(on);adb.setEnabled(true);
          state.setText(on?"Wireless ADB OPEN on port 5555 (maximum 30 minutes)\n"+addresses():"Wireless ADB is off");
        }); } catch(Exception ignored) { }
      });
      refresh.postDelayed(this,5000);
    }};
    dialog.setOnDismissListener(d->refresh.removeCallbacksAndMessages(null));
    dialog.show();refresh.postDelayed(poll,5000);
  }
  private void toggle(boolean on,CheckBox check,TextView status) {
    check.setEnabled(false);status.setText(on?"Opening and verifying...":"Closing and verifying...");
    command(()->{WirelessAdb.setEnabled(on);return on?"Wireless ADB OPEN on port 5555. Auto-off within 30 minutes.\n"+addresses():"Wireless ADB is off";},()->{
      status.setText(maintenance);
      // Read the listener again, never infer checked state from the requested action.
      worker.execute(()->{try{boolean open=WirelessAdb.listening();owner.runOnUiThread(()->{check.setChecked(open);check.setEnabled(true);});}catch(Exception e){owner.runOnUiThread(()->check.setEnabled(false));}});
    });
  }
  private void tools() {
    new AlertDialog.Builder(owner).setTitle("Maintenance tools").setItems(new String[]{"Close wireless ADB now", "Restart dashboard app", "Restart frame", "Date and time settings", "App settings", "Accessibility settings"},(d,n)->{
      if(n==0)command(()->{WirelessAdb.setEnabled(false);return "Wireless ADB is off";},()->message("Maintenance",maintenance));
      if(n==1)owner.recreate();
      if(n==2)new AlertDialog.Builder(owner).setTitle("Restart frame?").setMessage("The screen will go off while Android restarts. Your settings and sign-ins stay saved.")
        .setPositiveButton("Restart",(x,i)->command(()->{WirelessAdb.setEnabled(false);WirelessAdb.root("reboot");return "Restart requested";},null)).setNegativeButton("Cancel",null).show();
      if(n==3)settings(Settings.ACTION_DATE_SETTINGS);
      if(n==4)settings(Settings.ACTION_APPLICATION_SETTINGS);
      if(n==5)settings(Settings.ACTION_ACCESSIBILITY_SETTINGS);
    }).setNegativeButton("Back",(d,n)->maintenance()).show();
  }
  private void message(String title,String body) { new AlertDialog.Builder(owner).setTitle(title).setMessage(body).setPositiveButton("OK",null).show(); }
  private interface Job { String run() throws Exception; }
  private void command(Job job,Runnable after) {
    if(busy)return;busy=true;
    worker.execute(()->{
      String result;try{result=job.run();}catch(Exception e){result="Could not verify the change. "+e.getMessage();}
      final String outcome=result;
      owner.runOnUiThread(()->{maintenance=outcome;busy=false;if(!closed && after!=null)after.run();});
    });
  }
  void destroy() {closed=true;worker.shutdown();}
}
