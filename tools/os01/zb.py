"""Rendu z-buffer ortho rapide (numba), avec arêtes vives et ombrage plat."""
import numpy as np, numba as nb, cv2
from kit import *
import ctl
@nb.njit(parallel=False,cache=True)
def _rast(P,D,T,C,w,h):
    img=np.zeros((h,w,3),np.float32);zb=np.full((h,w),1e18,np.float32);idb=np.full((h,w),-1,np.int32)
    for i in range(T.shape[0]):
        a,b,c=T[i,0],T[i,1],T[i,2]
        x0,y0,x1,y1,x2,y2=P[a,0],P[a,1],P[b,0],P[b,1],P[c,0],P[c,1]
        den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2)
        if abs(den)<1e-9: continue
        mnx=max(int(min(x0,x1,x2)),0);mxx=min(int(max(x0,x1,x2))+1,w-1)
        mny=max(int(min(y0,y1,y2)),0);mxy=min(int(max(y0,y1,y2))+1,h-1)
        d0,d1,d2=D[a],D[b],D[c]
        for y in range(mny,mxy+1):
            for x in range(mnx,mxx+1):
                px=x+.5;py=y+.5
                l0=((y1-y2)*(px-x2)+(x2-x1)*(py-y2))/den
                l1=((y2-y0)*(px-x2)+(x0-x2)*(py-y2))/den
                l2=1-l0-l1
                if l0>=-1e-4 and l1>=-1e-4 and l2>=-1e-4:
                    z=l0*d0+l1*d1+l2*d2
                    if z<zb[y,x]:
                        zb[y,x]=z;idb[y,x]=i
                        img[y,x,0]=C[i,0];img[y,x,1]=C[i,1];img[y,x,2]=C[i,2]
    return img,zb,idb
VD={'front':(0,-1,0),'rear':(0,1,0),'right':(1,0,0),'left':(-1,0,0),'top':(0,0,1),'bottom':(0,0,-1)}
def shade(V,T,M,view,light=None):
    a=V[T[:,1]]-V[T[:,0]];b=V[T[:,2]]-V[T[:,0]];N=np.cross(a,b);l=np.linalg.norm(N,axis=1);l[l==0]=1;N/=l[:,None]
    vd=np.array(VD[view],float)
    L=np.array(light if light is not None else {'front':(-.5,-.55,.65),'rear':(.5,.55,.65),'right':(.55,-.5,.65),'left':(-.55,.5,.65),'top':(-.5,-.4,.75),'bottom':(.4,.4,-.75)}[view],float);L/=np.linalg.norm(L)
    s=.22+.62*np.clip(N@L,0,1)+.28*np.abs(N@vd)
    cols=np.array([COL[m] for m in MATS])[M][:,::-1]
    em=np.isin(M,[MI['BLUE'],MI['AMBER'],MI['RED'],MI['LIGHT']])
    return np.where(em[:,None],cols,cols*s[:,None]).astype(np.float32),N
def render(V,T,M,view,scale=1,line=False,bg=18):
    P,D=ctl.project(V,view);h,w=ctl.SIZE[view];w*=scale;h*=scale
    C,N=shade(V,T,M,view)
    img,zb,idb=_rast((P*scale).astype(np.float64),D.astype(np.float64),T,C.astype(np.float64),w,h)
    out=np.clip(img,0,1);out=(out*255).astype(np.uint8)
    out[idb<0]=bg
    if line:
        # filaire : discontinuités d'id/normale/profondeur
        n=np.zeros((h,w,3),np.float32);mask=idb>=0;n[mask]=N[idb[mask]]
        zz=zb.copy();zz[~mask]=zz[mask].max()+200 if mask.any() else 0
        e=np.zeros((h,w),bool)
        for ax in (0,1):
            dn=np.abs(np.diff(n,axis=ax)).sum(axis=2)>.5
            dz=np.abs(np.diff(zz,axis=ax))>1.5*max(1,1)
            ee=dn|dz
            if ax==0:e[:-1,:]|=ee
            else:e[:,:-1]|=ee
        return out,(255*(1-e)).astype(np.uint8)
    return out
def edge_f(V,T,M,view,refname):
    """score d'alignement des traits : F1 à 3 px entre arêtes du modèle et traits de la planche"""
    _,lines=render(V,T,M,view,line=True)
    ref=cv2.imread(f'/home/claude/os01/ref/{refname}.png',0)<170
    mod=lines<128
    d_ref=cv2.distanceTransform((~ref).astype(np.uint8),cv2.DIST_L2,3);d_mod=cv2.distanceTransform((~mod).astype(np.uint8),cv2.DIST_L2,3)
    prec=(d_ref[mod]<=3).mean();rec=(d_mod[ref]<=3).mean()
    return prec,rec,2*prec*rec/max(1e-6,prec+rec),lines
