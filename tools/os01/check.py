import bpy
import sys;sys.path.insert(0,'.')
import numpy as np,cv2,ctl,zb,build_all
from kit import *
A=B();P=build_all.parts()
for k,v in P.items(): A.merge(v)
V,T,M=A.tris();print('tris',len(T),{k:len(v.tris()[1]) for k,v in P.items()})
r,S=ctl.scores(V,T)
for v,m,ln in (('front','front','front'),('rear','rear','rear'),('right','right','right'),('top','top','top')):
    pr,re,f,l=zb.edge_f(V,T,M,v,ln);print(v,'traits P/R/F %.3f %.3f %.3f'%(pr,re,f))
    d=ctl.diff_img(S[v],ctl.refmask(m));cv2.imwrite(f'../ctl/d_{v}.png',d);cv2.imwrite(f'../ctl/l_{v}.png',l)
