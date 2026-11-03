import cv2,numpy as np
m=cv2.imread('ref/mask_top_c.png',0)>0
cx,cy=627,605
print('top radial (deg from +X, ccw): inner/outer runs')
for a in [0,22.5,67.5,112.5,157.5,202.5,247.5,292.5,337.5,45,90,135,180,225,270,315]:
    t=np.radians(a);rs=np.arange(0,720)
    xs=(cx+rs*np.cos(t)).astype(int);ys=(cy-rs*np.sin(t)).astype(int)
    ok=(xs>=0)&(xs<1254)&(ys>=0)&(ys<1254)
    v=np.zeros_like(rs,bool);v[ok]=m[ys[ok],xs[ok]]
    runs=[];s=None
    for r,b in zip(rs,v):
        if b and s is None:s=r
        if not b and s is not None:
            if r-s>3:runs.append((int(s),int(r)))
            s=None
    print(a,runs)
for k in ['front','right','rear']:
    f=cv2.imread(f'ref/mask_{k}.png',0)>0
    print(k,'rows y: x-extents runs')
    for y in list(range(10,400,30))+list(range(400,930,30)):
        x=np.where(f[y])[0]
        if len(x)==0: print(y,'-');continue
        d=np.diff(x);br=np.where(d>2)[0]
        st=[x[0]]+[x[i+1] for i in br];en=[x[i] for i in br]+[x[-1]]
        print(y,' '.join(f'{a-836}:{b-836}' for a,b in zip(st,en) if b-a>=1))
    if k=='front':
        print('cols x: y extents')
        for xx in range(40,840,40):
            y=np.where(f[:,xx])[0]
            print(xx-836,y.min() if len(y) else None,y.max() if len(y) else None)
