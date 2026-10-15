package com.wesbos.homehq;
public class WirelessAdbTest {
  static void check(boolean ok,String label){if(!ok)throw new AssertionError(label);}
  public static void main(String[] args) throws Exception {
    check(WirelessAdb.hasListener("0: 00000000:15B3 00000000:0000 0A 00000000:00000000"),"IPv4 listener");
    check(WirelessAdb.hasListener("  2: 00000000000000000000000000000000:15B3 00000000000000000000000000000000:0000 0A"),"IPv6 listener");
    check(!WirelessAdb.hasListener("0: 00000000:15B3 00000000:0000 01"),"Established is not listening");
    check(!WirelessAdb.hasListener("0: 00000000:15B4 00000000:0000 0A"),"Different port");
    check(!WirelessAdb.hasListener("sl local_address rem_address st\n"),"Empty socket table");
    System.out.println("5 ADB socket parsing scenarios passed");
  }
}
