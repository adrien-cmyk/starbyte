import numpy as np, cv2
from scipy import ndimage as ni
U='/mnt/user-data/uploads/'
F={'top_c':'OS-01_station_with_radial_docking_ring-1.png','front_c':'OS-01_Station_Front_Orthographic_View-2.png',
   'rear':'Rear_Space_Station_Ring_Blueprint-3.png','front':'Front_blueprint_of_a_ring_space_station-4.png',
   'right':'Orbital_station_right-side_blueprint-5.png','top':'Eight-Spoke_Space_Station_Blueprint-6.png'}
def color_mask(im,thr=38):
    m=(im.max(axis=2)>thr).astype(np.uint8)
    # red halos: keep. open noise
    n,l,s,_=cv2.connectedComponentsWithStats(m,connectivity=8)
    big=s[1:,4].argmax()+1
    keep=np.zeros_like(m)
    for i in range(1,n):
        if s[i,4]>=6: keep[l==i]=1
    return keep
def line_mask(im,name):
    g=im.min(axis=2)
    ink=(g<200).astype(np.uint8)
    ink=cv2.morphologyEx(ink,cv2.MORPH_CLOSE,np.ones((2,2),np.uint8))
    n,l,s,_=cv2.connectedComponentsWithStats(1-ink,connectivity=4)
    bg=l[0,0]
    m=(l!=bg).astype(np.uint8)
    # re-open real holes
    h,w=m.shape
    for i in range(1,n):
        if i==bg: continue
        a=s[i,4]; cx=s[i,0]+s[i,2]/2; cy=s[i,1]+s[i,3]/2
        if a<30: continue
        body= (395<cy<550) or (730<cx<945 and cy<395) or (700<cx<975 and cy>=550)
        tanks= (cy>=530 and cy<=600 and (330<cx<475 or 1200<cx<1330))
        tw = cy<395 and (375<cx<445 or 1235<cx<1295 or 235<cx<345 or 1320<cx<1420)
        if not(body or tanks or tw): m[l==i]=0
    return m
def fill_small(m,amax):
    n,l,st,_=cv2.connectedComponentsWithStats(1-m,connectivity=4)
    bg=l[0,0]
    for i in range(1,n):
        if i!=bg and st[i,4]<amax: m[l==i]=1
    return m
def top_line_mask(im):
    g=im.min(axis=2);ink=(g<205).astype(np.uint8)
    ink=cv2.morphologyEx(ink,cv2.MORPH_CLOSE,np.ones((2,2),np.uint8))
    n,l,st,c=cv2.connectedComponentsWithStats(1-ink,connectivity=4)
    bg=l[0,0];m=(l!=bg).astype(np.uint8)
    for i in range(1,n):
        if i==bg or st[i,4]<35: continue
        r=np.hypot(c[i,0]-627,c[i,1]-605)
        if 145<r<338 and st[i,4]>2500: m[l==i]=0
    return m
out={}
for k,f in F.items():
    im=cv2.imread(U+f)
    out[k]=im
    if k.endswith('_c'): m=fill_small(cv2.morphologyEx(color_mask(im),cv2.MORPH_CLOSE,np.ones((3,3),np.uint8)),900)
    elif k=='top': m=top_line_mask(im)
    else: m=line_mask(im,k)
    if m is not None:
        cv2.imwrite(f'ref/mask_{k}.png',m*255)
        ys,xs=np.where(m); print(k,im.shape,'bbox x',xs.min(),xs.max(),'y',ys.min(),ys.max(),'cx',(xs.min()+xs.max())/2,'area',m.sum())
    cv2.imwrite(f'ref/{k}.png',im)
