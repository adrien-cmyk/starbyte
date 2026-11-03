"""Kit de modélisation numpy (unités : px de la vue de face, X droite, Y arrière, Z haut)."""
import numpy as np, math
LOD=False
MATS=['WHITE','WHITE2','GREY','DARK','STEEL','YELLOW','BLUE','AMBER','RED','SPHERE','DECK','LIGHT']
MI={m:i for i,m in enumerate(MATS)}
COL={'WHITE':(.78,.76,.72),'WHITE2':(.5,.49,.47),'GREY':(.14,.145,.155),'DARK':(.018,.019,.022),'STEEL':(.42,.43,.45),
     'YELLOW':(.86,.42,.01),'BLUE':(.08,.42,1.),'AMBER':(1.,.45,.10),'RED':(1.,.03,.02),'SPHERE':(.85,.85,.85),'DECK':(.34,.35,.37),'LIGHT':(.72,.88,1.)}
def Rz(a):
    c,s=math.cos(a),math.sin(a);return np.array([[c,-s,0],[s,c,0],[0,0,1.]])
def Rx(a):
    c,s=math.cos(a),math.sin(a);return np.array([[1,0,0],[0,c,-s],[0,s,c.__float__()]])
def Ry(a):
    c,s=math.cos(a),math.sin(a);return np.array([[c,0,s],[0,1,0],[-s,0,c]])
class B:
    def __init__(s,name=''):
        s.V=[];s.F=[];s.M=[];s.n=0;s.R=np.eye(3);s.T=np.zeros(3);s.stack=[];s.name=name
    # --- repères
    def push(s,R=None,T=None):
        s.stack.append((s.R,s.T))
        R=np.eye(3) if R is None else R; T=np.zeros(3) if T is None else np.asarray(T,float)
        s.T=s.T+s.R@T; s.R=s.R@R
    def pop(s): s.R,s.T=s.stack.pop()
    def polar(s,th,r=0.,z=0.):
        """repère local : x tangent (sens +th), y radial vers l'extérieur, z haut"""
        ca,sa=math.cos(th),math.sin(th)
        R=np.array([[-sa,ca,0],[ca,sa,0],[0,0,1.]])
        s.push(R,(r*ca,r*sa,z))
    def add(s,v,f,mat):
        v=np.asarray(v,float); v=(s.R@v.T).T+s.T
        s.V.append(v); m=MI[mat]
        for q in f: s.F.append([i+s.n for i in q]); s.M.append(m)
        s.n+=len(v)
    # --- primitives
    def box(s,c,d,mat,ch=0.,tap=None):
        """boîte centrée c, tailles d, chanfrein ch (toutes arêtes) ; tap=(kx,ky) rétrécit le haut"""
        cx,cy,cz=c;dx,dy,dz=[a/2 for a in d]
        ch=min(ch,dx*.9,dy*.9,dz*.9)
        if LOD and min(dx,dy,dz)<9: ch=0
        kx,ky=(tap if tap else (1,1))
        if ch<=1e-6:
            v=[(-dx,-dy,-dz),(dx,-dy,-dz),(dx,dy,-dz),(-dx,dy,-dz),(-dx*kx,-dy*ky,dz),(dx*kx,-dy*ky,dz),(dx*kx,dy*ky,dz),(-dx*kx,dy*ky,dz)]
            f=[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
        else:
            a,b,e=dx-ch,dy-ch,dz-ch
            v=[]
            for sz,zz,kk in ((-1,dz,1),(-1,e,1),(1,e,1),(1,dz,1)):
                z=sz*zz
                # octogone en plan
                aa,bb=(a,b) if abs(zz-dz)<1e-9 else (dx,dy)
                cc=0 if abs(zz-dz)<1e-9 else ch
                kx2,ky2=(kx,ky) if sz>0 else (1,1)
                if abs(zz-dz)<1e-9:
                    ring=[(-a,-b),(a,-b),(a,-b),(a,b),(a,b),(-a,b),(-a,b),(-a,-b)]
                    ring=[(-a,-dy+ch),(a,-dy+ch),(dx-ch,-b),(dx-ch,b),(a,dy-ch),(-a,dy-ch),(-dx+ch,b),(-dx+ch,-b)]
                else:
                    ring=[(-a,-dy),(a,-dy),(dx,-b),(dx,b),(a,dy),(-a,dy),(-dx,b),(-dx,-b)]
                v+= [(x*kx2,y*ky2,z) for x,y in ring]
            f=[tuple(range(7,-1,-1)),tuple(range(24,32))]
            for l in range(3):
                for i in range(8):
                    j=(i+1)%8
                    f.append((l*8+i,l*8+j,(l+1)*8+j,(l+1)*8+i))
        v=np.array(v,float)+(cx,cy,cz)
        s.add(v,f,mat)
    def poly(s,pts,axis,a0,a1,mat):
        """prisme : pts (u,v) extrudé selon axis de a0 à a1. axis x:(u,v)=(y,z) ; y:(x,z) ; z:(x,y)"""
        n=len(pts);V=[]
        for a in (a0,a1):
            for u,w in pts:
                V.append({'x':(a,u,w),'y':(u,a,w),'z':(u,w,a)}[axis])
        f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
        f+=[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
        if axis=='y': f=[q[::-1] for q in f]
        s.add(V,f,mat)
    def cyl(s,p0,p1,r,mat,n=10,r2=None,caps=True):
        if LOD: n=max(4,int(n*.6))
        p0=np.asarray(p0,float);p1=np.asarray(p1,float);r2=r if r2 is None else r2
        w=p1-p0;l=np.linalg.norm(w);w=w/max(l,1e-9)
        u=np.cross(w,(0,0,1.)) if abs(w[2])<.9 else np.cross(w,(1.,0,0));u/=np.linalg.norm(u);t=np.cross(w,u)
        V=[];
        for a,rr in ((p0,r),(p1,r2)):
            for i in range(n):
                th=2*math.pi*i/n
                V.append(a+rr*(math.cos(th)*u+math.sin(th)*t))
        f=[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
        if caps: f+=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
        s.add(V,f,mat)
    def lathe(s,prof,mat,n=24,c=(0,0,0),cap=True,phase=None):
        """prof : [(r,z)] de bas en haut ; axe Z"""
        if LOD and n>=12: n=max(10,n//2)
        m=len(prof);V=[]
        ph=math.pi/n if phase is None else phase
        for r,z in prof:
            for i in range(n):
                th=2*math.pi*i/n+ph
                V.append((c[0]+r*math.cos(th),c[1]+r*math.sin(th),c[2]+z))
        f=[]
        for l in range(m-1):
            for i in range(n):
                j=(i+1)%n
                f.append((l*n+i,l*n+j,(l+1)*n+j,(l+1)*n+i))
        if cap:
            if prof[0][0]>0: f.append(tuple(range(n-1,-1,-1)))
            if prof[-1][0]>0: f.append(tuple(range((m-1)*n,m*n)))
        s.add(V,f,mat)
    def sphere(s,c,r,mat,n=12,m=8):
        if LOD: n=max(5,int(n*.6));m=max(3,int(m*.6))
        V=[];f=[]
        for j in range(m+1):
            ph=math.pi*j/m
            for i in range(n):
                th=2*math.pi*i/n
                V.append((c[0]+r*math.sin(ph)*math.cos(th),c[1]+r*math.sin(ph)*math.sin(th),c[2]-r*math.cos(ph)))
        for j in range(m):
            for i in range(n):
                a=j*n+i;b=j*n+(i+1)%n;f.append((a,b,b+n,a+n))
        s.add(V,f,mat)
    def arc(s,sec,t0,t1,mat,step=2.5,c=(0,0),caps=True):
        """balaye la section sec [(r,z)] (fermée, CCW) autour de Z entre t0 et t1 (deg)."""
        n=max(1,int(abs(t1-t0)/(step*(3.2 if LOD else 1))+.999));m=len(sec);V=[]
        for i in range(n+1):
            t=math.radians(t0+(t1-t0)*i/n);ca,sa=math.cos(t),math.sin(t)
            for r,z in sec: V.append((c[0]+r*ca,c[1]+r*sa,z))
        f=[]
        for i in range(n):
            for k in range(m):
                l=(k+1)%m
                f.append((i*m+k,(i+1)*m+k,(i+1)*m+l,i*m+l))
        if caps:
            f.append(tuple(range(m-1,-1,-1)));f.append(tuple(range(n*m,n*m+m)))
        s.add(V,f,mat)
    def beam(s,p0,p1,w,mat,h=None):
        """poutre carrée entre deux points"""
        p0=np.asarray(p0,float);p1=np.asarray(p1,float);h=w if h is None else h
        d=p1-p0;l=np.linalg.norm(d);d=d/max(l,1e-9)
        u=np.cross(d,(0,0,1.)) if abs(d[2])<.95 else np.cross(d,(1.,0,0));u/=np.linalg.norm(u);t=np.cross(u,d)
        V=[]
        for a in (p0,p1):
            for sa,sb in ((-1,-1),(1,-1),(1,1),(-1,1)):
                V.append(a+sa*w/2*u+sb*h/2*t)
        f=[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
        s.add(V,f,mat)
    def truss(s,p0,p1,w,h,bays,mat,bar=1.6,chord=None,up=(0,0,1.)):
        """treillis caisson (4 membrures, diagonales sur les 4 faces). w : largeur, h : hauteur"""
        p0=np.asarray(p0,float);p1=np.asarray(p1,float);d=p1-p0;l=np.linalg.norm(d);d/=l
        u=np.cross(d,up);u/=np.linalg.norm(u);t=np.cross(u,d);chord=chord or bar*1.8
        cor=[(-1,-1),(1,-1),(1,1),(-1,1)]
        P=lambda i,c:(p0+d*l*i/bays+c[0]*w/2*u+c[1]*h/2*t)
        for c in cor: s.beam(P(0,c),P(bays,c),chord,mat)
        for i in range(bays+1):
            for k in range(4): s.beam(P(i,cor[k]),P(i,cor[(k+1)%4]),bar,mat)
        for i in range(bays):
            for k in range(4):
                a,b=(i,i+1) if i%2==0 else (i+1,i)
                s.beam(P(a,cor[k]),P(b,cor[(k+1)%4]),bar,mat)
    def rivets(s,pts,r,mat,n=6,h=.7,nrm=(0,0,1.)):
        for p in pts:
            p=np.asarray(p,float);s.cyl(p,p+np.asarray(nrm)*h,r,mat,n=n,r2=r*.75)
    def merge(s,o):
        V,F,M=o.arrays();s.V.append(V);s.F+= [[i+s.n for i in q] for q in F];s.M+=list(M);s.n+=len(V)
    def arrays(s):
        return (np.vstack(s.V) if s.V else np.zeros((0,3))),s.F,np.array(s.M,int)
    def tris(s):
        V,F,M=s.arrays();T=[];TM=[]
        for q,m in zip(F,M):
            for i in range(1,len(q)-1): T.append((q[0],q[i],q[i+1]));TM.append(m)
        return V,np.array(T,np.int64).reshape(-1,3),np.array(TM,int)

def _loop(self,outer,inner,axis,a0,a1,mat):
    """cadre plein : polygones outer/inner (même nb de points) extrudés selon axis"""
    n=len(outer);V=[]
    def P(u,w,a): return {'x':(a,u,w),'y':(u,a,w),'z':(u,w,a)}[axis]
    for a in (a0,a1):
        for u,w in outer: V.append(P(u,w,a))
    for a in (a0,a1):
        for u,w in inner: V.append(P(u,w,a))
    f=[]
    for i in range(n):
        j=(i+1)%n
        f.append((i,j,n+j,n+i))          # extérieur
        f.append((3*n+i,3*n+j,2*n+j,2*n+i)) # intérieur
        f.append((2*n+i,2*n+j,j,i))      # face a0
        f.append((n+i,n+j,3*n+j,3*n+i))  # face a1
    if axis=='y': f=[q[::-1] for q in f]
    self.add(V,f,mat)
B.loop=_loop
def _quad(self,p,mat):
    self.add(p,[(0,1,2,3)],mat)
B.quad=_quad

def _win(self,c,w,h,mat='BLUE',cols=2,rows=8,axis='y',sg=1,depth=.7):
    """fenêtre structurée : cadre sombre + cellules. c=centre, face normale axis (sg)."""
    cx,cy,cz=c
    def P(u,v,d):
        if axis=='y': return (cx+u,cy+sg*d,cz+v)
        return (cx+sg*d,cy+u,cz+v)
    def BB(du,dv,dd): return (du,dd,dv) if axis=='y' else (dd,du,dv)
    self.box(P(0,0,0),BB(w,h,depth),'DARK')
    gw=w/cols;gh=h/rows
    for i in range(cols):
        for j in range(rows):
            u=-w/2+gw*(i+.5);v=-h/2+gh*(j+.5)
            self.box(P(u,v,depth/2+.1),BB(gw*.84,gh*.74,.2),mat)
            self.box(P(u,v,depth/2+.22),BB(gw*.5,gh*.3,.08),'LIGHT')
B.win=_win
