"""Contrôles rapides : silhouettes (IoU), rendu peintre ortho, fondu."""
import numpy as np, cv2, sys
from kit import *
K=1.30
TC=(627.,605.)
def project(V,view):
    x,y,z=V[:,0],V[:,1],V[:,2]
    if view=='front': return np.c_[836.5+x,457-z],y   # profondeur: y croît = plus loin
    if view=='rear':  return np.c_[836.5-x,457-z],-y
    if view=='right': return np.c_[836.5+y,457-z],-x
    if view=='left':  return np.c_[836.5-y,457-z],x
    if view=='top':   return np.c_[TC[0]+x/K,TC[1]-y/K],-z
    if view=='bottom':return np.c_[TC[0]+x/K,TC[1]+y/K],z
SIZE={'front':(941,1672),'rear':(941,1672),'right':(941,1672),'top':(1254,1254)}
def silh(V,T,view,ss=2):
    P,_=project(V,view);h,w=SIZE[view]
    pts=np.round(P*16*ss).astype(np.int32)
    m=np.zeros((h*ss,w*ss),np.uint8)
    tri=pts[T]
    # culling inutile : on remplit tout
    for t in tri: cv2.fillConvexPoly(m,t,1,lineType=cv2.LINE_8,shift=4)
    return cv2.resize(m,(w,h),interpolation=cv2.INTER_AREA)>0 if ss>1 else m>0
REFM={}
def refmask(k):
    if k not in REFM: REFM[k]=cv2.imread(f'/home/claude/os01/ref/mask_{k}.png',0)>0
    return REFM[k]
def iou(a,b): return (a&b).sum()/max(1,(a|b).sum())
def scores(V,T,verbose=True):
    res={}
    S={v:silh(V,T,v) for v in ('front','rear','right','top')}
    for name,v,r in (('front','front','front'),('front_c','front','front_c'),('rear','rear','rear'),('right','right','right'),('top','top','top'),('top_c','top','top_c')):
        res[name]=iou(S[v],refmask(r))
    if verbose: print(' '.join(f'{k}={v:.3f}' for k,v in res.items()))
    return res,S
def diff_img(S,ref):
    h,w=S.shape;o=np.zeros((h,w,3),np.uint8)
    o[S&ref]=(200,200,200);o[S&~ref]=(60,60,255);o[~S&ref]=(60,255,60)
    return o
LIGHT=np.array([-.45,-.55,.7]);LIGHT/=np.linalg.norm(LIGHT)
def paint(V,T,M,view,bg=(18,18,18),edges=True,scale=1):
    P,D=project(V,view);h,w=SIZE[view];h*=scale;w*=scale
    a=V[T[:,1]]-V[T[:,0]];b=V[T[:,2]]-V[T[:,0]];N=np.cross(a,b);l=np.linalg.norm(N,axis=1);l[l==0]=1;N/=l[:,None]
    vdir={'front':(0,-1,0),'rear':(0,1,0),'right':(1,0,0),'left':(-1,0,0),'top':(0,0,1),'bottom':(0,0,-1)}[view]
    vd=np.array(vdir,float)
    vis=N@vd>-1e-6
    light=LIGHT if view!='rear' else np.array([.45,.55,.7])
    if view in('right',): light=np.array([.55,-.45,.7])
    sh=.28+.72*np.clip(N@(light/np.linalg.norm(light)),0,1)+.15*np.clip(N@vd,0,1)
    cols=np.array([COL[m] for m in MATS])[M][:,::-1]
    em=np.isin(M,[MI['BLUE'],MI['AMBER'],MI['RED'],MI['LIGHT']])
    C=np.where(em[:,None],cols,cols*sh[:,None]);C=(np.clip(C,0,1)*255).astype(np.uint8)
    d=D[T].mean(axis=1);o=np.argsort(-d)
    o=o[vis[o]]
    img=np.full((h,w,3),bg,np.uint8);pts=np.round(P*16*scale).astype(np.int32);tri=pts[T]
    for i in o:
        c=C[i];cv2.fillConvexPoly(img,tri[i],(int(c[0]),int(c[1]),int(c[2])),lineType=cv2.LINE_AA,shift=4)
    return img
def bundle(b,tag,views=('front','right','rear','top'),both=True):
    V,T,M=b.tris()
    res,S=scores(V,T)
    print('tris',len(T))
    out=[]
    for v,r,rc in (('front','front','front_c'),('right','right',None),('rear','rear',None),('top','top_c','top_c')):
        if v not in views: continue
        p=paint(V,T,M,v)
        d=diff_img(S[v],refmask(r))
        ref=cv2.imread(f'/home/claude/os01/ref/{rc or r}.png') if (rc or r) else None
        if v=='right' or v=='rear': ref=cv2.imread(f'/home/claude/os01/ref/{v}.png')
        row=np.hstack([ref,p,d])
        cv2.imwrite(f'/home/claude/os01/ctl/{tag}_{v}.png',cv2.resize(row,None,fx=.5,fy=.5,interpolation=cv2.INTER_AREA) if v!='top' else cv2.resize(row,None,fx=.6,fy=.6,interpolation=cv2.INTER_AREA))
    return res
