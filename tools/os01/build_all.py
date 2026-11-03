import m1_ring,m2_core,m3_mod,m4_dress,m6_relief
def parts(green=True):
    P={}
    for m in (m1_ring,m2_core,m3_mod,m4_dress,m6_relief):
        P.update(m.build())
    if green:
        import m5_green
        P.update(m5_green.build(P))
    return P
