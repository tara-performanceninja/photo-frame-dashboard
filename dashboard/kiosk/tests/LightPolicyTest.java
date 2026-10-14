package com.wesbos.homehq;
class LightPolicyTest {
  static void check(boolean result, String label) { if (!result) throw new AssertionError(label); }
  public static void main(String[] args) {
    LightPolicy p = new LightPolicy();
    check(p.sample(41,0)==0 && p.sample(41,19999)==0 && p.sample(41,20000)==1,"20 second dark hold");
    check(p.sample(40,21000)==0,"no repeated darkness");
    check(p.sample(61,22000)==0 && p.sample(61,24999)==0 && p.sample(61,25000)==2,"3 second light return");
    check(p.sample(61,30000)==0 && p.sample(61,40000)==0,"daylight preserves idle saver");
    p.sample(41,41000); p.sample(50,60000);
    check(p.sample(41,61000)==0 && p.sample(41,81000)==1,"dead band resets hold");
    p.manual(82000);
    check(p.sample(41,141999)==0 && p.sample(41,142000)==0 && p.sample(41,162000)==1,"manual 60 second grace");
    p.sample(61,163000); p.sample(Float.NaN,165000);
    check(p.sample(61,166000)==0 && p.sample(61,169000)==2,"invalid reading breaks continuity");
    p.sample(41,170000);p.reset();
    check(p.sample(41,190000)==0,"pause/gap resets hold");
    System.out.println("7 light policy scenarios passed");
  }
}
