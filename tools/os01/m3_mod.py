"""M3 : grues, tours, sphères, réservoirs, modules de plan, antennes."""
import numpy as np, math, random
from kit import *
from m2_core import Y,lamps
def crane(b,bd,ft,tw,tail=30.,tip=46.,yellow='YELLOW',zdeck=60,ztw=None):
    """ft=(x,y) pied portique, tw=(x,y) tour treillis. flèche droite de ft vers tw, prolongée."""
    ft=np.array(ft,float);tw=np.array(tw,float);d=tw-ft;L=np.linalg.norm(d);d/=L;n=np.array([-d[1],d[0]])
    # repère local : x le long de la flèche, y travers
    ang=math.atan2(d[1],d[0]);b.push(Rz(ang),(ft[0],ft[1],0))
    zb0=Y(297);zb1=Y(280)
    xt=L  # tour
    xa=-tail;xb=L+tip
    # flèche treillis jaune
    b.truss((xa+22,0,(zb0+zb1)/2),(xb,0,(zb0+zb1)/2),17,zb1-zb0,int((xb-xa-22)/11),yellow,bar=1.2,chord=2.0)
    # lisse supérieure et chariot
    b.box(((xa+xb)/2+11,0,zb1+.8),(xb-xa-22,5,1.4),'GREY')
    # tête de portique (y 275-302)
    b.box((12,0,Y(288)),(46,18,26),'GREY',ch=2.2)
    b.box((12,-9.4,Y(288)),(26,1,12),'DARK');b.box((12,9.4,Y(288)),(26,1,12),'DARK')
    b.box((6,-10,Y(288)),(6,.6,6),'YELLOW');b.box((6,10,Y(288)),(6,.6,6),'YELLOW')
    b.box((12,0,Y(272)),(22,14,8),yellow,ch=1)
    # contrepoids de queue (x tail)
    b.box((xa+12,0,Y(298)),(26,16,16),yellow,ch=1.5)
    b.box((xa+12,0,Y(298)),(14,17,6),'DARK')
    # jambes : pylône treillis extérieur + jambes jaunes en A
    b.truss((0-4,0,zdeck+6),(0-4,0,Y(300)),18,20,9,'GREY',bar=1.,chord=1.8,up=(1,0,0))
    for sy in (-1,1):
        b.beam((30,sy*9,zdeck+8),(22,sy*7,Y(292)),5.5,yellow)
        b.beam((4,sy*9,zdeck+8),(22,sy*7,Y(292)),3.2,yellow)
    b.box((27,0,Y(330)),(5,16,3),'GREY')
    b.box((22,0,Y(350)),(16,14,3),'GREY')
    # socle
    b.box((10,0,zdeck+5),(62,30,10),'GREY',ch=2)
    b.box((10,0,zdeck+2),(66,34,5),'WHITE2',ch=1.2)
    for sy in (-1,1):
        b.box((10,sy*15.4,zdeck+5),(30,1,5),'DARK')
        for k in range(3): bd.box((0+k*10,sy*15.8,zdeck+5),(6,.4,3),'AMBER')
    # tour treillis
    zt_=zdeck if ztw is None else ztw
    b.truss((xt,0,zt_-2),(xt,0,zb0),20,20,9 if ztw is None else 13,'GREY',bar=1.,chord=1.9,up=(1,0,0))
    b.box((xt,0,Y(335)),(24,24,8),yellow,ch=1)
    bd.box((xt,0,Y(335)),(25,25,2.4),'DARK')
    b.box((xt,0,zt_+2),(30,28,8),'GREY',ch=1.5)
    # apex (triangle y 258-282) + haubans
    b.truss((xt,0,zb1),(xt,0,Y(259)),16,16,2,yellow,bar=1.1,chord=1.9,up=(1,0,0))
    for sx,x1 in ((-1,xt-88),(1,xt+52)):
        for sy in (-1,1):
            b.beam((xt,sy*5,Y(259)),(x1,sy*6,zb1),1.6,yellow)
    b.box((xt,0,Y(258)),(20,14,3),yellow)
    # chariot + grappin (x ~ 40% portée)
    xh=L*.48
    b.box((xh,0,zb0-2),(16,14,4),'GREY',ch=1)
    b.cyl((xh-3,0,zb0-3),(xh-3,0,Y(328)),.7,'STEEL',n=5);b.cyl((xh+3,0,zb0-3),(xh+3,0,Y(328)),.7,'STEEL',n=5)
    b.box((xh,0,Y(325)),(11,9,7),yellow if yellow!='YELLOW' else 'YELLOW',ch=1)
    b.cyl((xh,0,Y(329)),(xh,0,Y(338)),2,'STEEL',n=6)
    for sx in (-1,1):
        b.beam((xh,0,Y(337)),(xh+sx*12,0,Y(346)),2.4,'GREY')
        b.beam((xh+sx*12,0,Y(346)),(xh+sx*13,0,Y(356)),2.2,'YELLOW')
        b.beam((xh+sx*13,0,Y(356)),(xh+sx*7,0,Y(358)),1.8,'YELLOW')
    b.pop()
def rail(b,p0,p1,z=54):
    """poutre de reprise au niveau du pont"""
    b.truss((p0[0],p0[1],z),(p1[0],p1[1],z),12,10,max(2,int(np.hypot(p1[0]-p0[0],p1[1]-p0[1])/16)),'GREY',bar=1.,chord=1.8)
def tall_tower(b,bd,x,y,mir,rng):
    """tour haute à trois colonnes (face: x-456..-401, y 250-395) ; mir=±1 pour le côté"""
    b.push(None,(x,y,0))
    z0=26
    # socle (y 355-395, x -470..-394)
    b.box((0,0,(z0+Y(372))/2),(62,62,Y(372)-z0),'GREY',ch=3)
    b.box((0,0,Y(372)),(70,70,8),'WHITE2',ch=2)
    # colonnes
    cols=[(-16,-16,'GREY'),(16,-16,'WHITE'),(-16,16,'STEEL'),(16,16,'GREY')]
    for u,v,mat in cols:
        top=rng.choice([252,262,274])if (u,v)!=(-16,-16) else 252
        H=371-top
        b.box((u,v,Y(top+H/2)),(23,23,H),mat,ch=2.2)
        b.box((u,v,Y(top-5)),(17,17,10),'GREY',ch=1.5,tap=(.75,.75))
        b.box((u,v,Y(top+18)),(25,25,3),'YELLOW' if rng.random()<.5 else 'STEEL')
        b.box((u,v,Y(top+50)),(25,25,2.4),'GREY')
    b.box((0,0,Y(320)),(14,14,105),'DARK')
    # faces : fenêtres, jaunes, échelles
    for nx,ny in ((0,-1),(0,1),(1,0),(-1,0)):
        def BX(u,z,du,dz,dd,mat,o=0):
            c=(nx*(27.7+o)+(u if nx==0 else 0),ny*(27.7+o)+(u if ny==0 else 0),z)
            b.box(c,(du,dd,dz) if nx==0 else (dd,du,dz),mat)
        for s in (-1,1):
            BX(s*16,Y(330),13,50,.8,'DARK')
            for k in range(5):
                BX(s*16,Y(312+k*9),10,5,.5,'AMBER' if rng.random()<.3 else 'STEEL',o=.5)
            BX(s*16,Y(280),14,18,.8,'STEEL')
            BX(s*16,Y(280),5,10,1.0,'YELLOW',o=.2)
            BX(s*8,Y(320),1.6,100,1.,'YELLOW')
        # entre-colonnes : passerelles
        BX(0,Y(300),4,70,.8,'STEEL',o=-8)
        for yy in np.arange(270,365,14):
            b.box((nx*15+(0 if nx else 0),ny*15,Y(yy)),(10 if nx==0 else 4,4 if nx==0 else 10,1.4),'GREY')
    # base : baies
    for nx,ny in ((0,-1),(0,1),(1,0),(-1,0)):
        c=(nx*31.4,ny*31.4,Y(385))
        b.box(c,(44,1,12) if nx==0 else (1,44,12),'DARK')
    # mâts
    b.box((-8,-8,Y(250)),(14,14,6),'GREY')
    b.cyl((-10,-10,Y(250)),(-10,-10,Y(210)),1.5,'STEEL',n=6,r2=.9);b.sphere((-10,-10,Y(206)),3.51,'RED',n=8,m=5)
    b.cyl((-17,-17,Y(262)),(-17,-17,Y(247)),1,'STEEL',n=5);b.sphere((-17,-17,Y(245)),2.43,'RED',n=8,m=5)
    b.cyl((30,30,Y(392)),(30,30,Y(340)),1.1,'STEEL',n=6);b.sphere((30,30,Y(337)),2.70,'RED',n=8,m=5)
    b.pop()
def sphere_mod(b,bd,x,y,rng):
    """bloc à sphère. c = position sphère"""
    b.push(None,(x,y,0))
    z0=26
    b.box((0,0,(z0+Y(362))/2),(38,38,Y(362)-z0),'GREY',ch=3)
    b.box((0,0,Y(362)),(32,32,8),'STEEL',ch=2)
    for nx,ny in ((0,-1),(0,1),(1,0),(-1,0)):
        c=(nx*19.3,ny*19.3,Y(385))
        b.box(c,(26,.8,22) if nx==0 else (.8,26,22),'DARK')
        c=(nx*19.8,ny*19.8,Y(385))
        b.box(c,(8,.5,10) if nx==0 else (.5,8,10),rng.choice(['AMBER','YELLOW','STEEL']))
        b.box((nx*19.6,ny*19.6,Y(370)),(30,1,2) if nx==0 else (1,30,2),'YELLOW')
    b.cyl((0,0,Y(362)),(0,0,Y(352)),6,'GREY',n=10)
    b.sphere((0,0,Y(340)),15,'SPHERE',n=18,m=12)
    b.lathe([(15.05,-.5),(15.3,0),(15.05,.5)],'DARK',n=18,c=(0,0,Y(340)),cap=False)
    b.lathe([(13.1,6.9),(13.3,7.4),(12.9,7.9)],'DARK',n=18,c=(0,0,Y(340)),cap=False)
    b.lathe([(13.1,-6.9),(13.3,-7.4),(12.9,-7.9)],'DARK',n=18,c=(0,0,Y(340)),cap=False)
    b.pop()
def side_tower(b,bd,x,y,sg,rng,up=True,w=64,d=54):
    """tour traversante (face : x -590..-525, y 365..545) + mâts haut et bas"""
    b.push(None,(x,y,0))
    if up:
        b.box((0,0,Y(392)),(w,d,80),'GREY',ch=3)
        b.box((0,0,Y(362)),(w-6,d-6,6),'WHITE2',ch=1.5)
        for nx,ny in ((0,-1),(0,1),(1,0),(-1,0)):
            c=(nx*(w/2+.3),ny*(d/2+.3),Y(392)) if nx else (0,ny*(d/2+.3),Y(392))
            b.box(c,(w*.6,.8,56) if nx==0 else (.8,d*.6,56),'DARK')
            for k in range(3):
                c2=(nx*(w/2+.8),ny*(d/2+.8),Y(375+k*17))
                b.box(c2,(w*.45,.5,9) if nx==0 else (.5,d*.45,9),rng.choice(['STEEL','WHITE2','GREY']))
        for sx in (-1,1):
            b.box((sx*(w/2-4),-d/2-.5,Y(392)),(2.4,1.2,70),'YELLOW')
        b.cyl((-w*.32,0,Y(365)),(-w*.32,0,Y(305)),1.5,'STEEL',n=6,r2=.9);b.sphere((-w*.32,0,Y(302)),3.24,'RED',n=8,m=5)
        b.cyl((-w*.14,0,Y(365)),(-w*.14,0,Y(320)),1.1,'STEEL',n=6,r2=.8);b.sphere((-w*.14,0,Y(317)),2.43,'RED',n=8,m=5)
    # partie basse
    b.box((0,0,Y(505)),(w,d*.9,50),'GREY',ch=3)
    b.box((0,0,Y(533)),(w-10,d*.7,6),'STEEL',ch=1.5)
    for sx in (-1,1):
        b.box((sx*(w/2-4),-d*.45-.5,Y(505)),(2.4,1.2,46),'YELLOW')
    b.box((0,-d*.45-.4,Y(505)),(w*.5,.8,36),'DARK')
    b.cyl((-w*.2,0,Y(535)),(-w*.2,0,Y(600)),1.3,'STEEL',n=6,r2=.8);b.sphere((-w*.2,0,Y(603)),2.97,'RED',n=8,m=5)
    b.cyl((-w*.05,0,Y(535)),(-w*.05,0,Y(584)),1.1,'STEEL',n=6,r2=.8);b.sphere((-w*.05,0,Y(587)),2.56,'RED',n=8,m=5)
    b.pop()
def tank_trio(b,bd,x,y,rng,zc=None):
    """trois barils alignés sur la diagonale (face: 3 lobes x 370..503, y 530..595)"""
    zc=Y(562) if zc is None else zc
    b.push(None,(x,y,0))
    dx=-1 if x<0 else 1;dy=-1 if y<0 else 1
    for k,(o,R,hh) in enumerate(((-38,27,32),(0,31,34),(36,27,32))):
        c=(dx*o,dy*o,zc)
        pr=[(0,-hh),(R*.62,-hh),(R*.88,-hh+R*.2),(R,-hh+R*.45),(R,hh-R*.45),(R*.88,hh-R*.2),(R*.62,hh),(0,hh)]
        b.lathe(pr,'SPHERE',n=16,c=c)
        for zz in (-hh*.7,0,hh*.7):
            b.lathe([(R+.1,zz-1.2),(R+.6,zz-1.),(R+.6,zz+1.),(R+.1,zz+1.2)],'YELLOW',n=16,c=c)
        for a in (0,math.pi/2,math.pi,3*math.pi/2):
            b.box((c[0]+R*math.cos(a+.78),c[1]+R*math.sin(a+.78),zc),(1.4,1.4,2*hh*.9),'YELLOW')
    # support
    b.box((0,0,zc+36),(60,60,8),'GREY',ch=2)
    b.box((0,0,zc+46),(22,22,16),'DARK')
    for s in (-1,1):
        b.cyl((s*12,s*12*-1,zc+38),(s*12,s*12*-1,zc+60),2,'STEEL',n=6)
    b.pop()
def low_cluster(b,bd,pts,rng,zt=85):
    for (x,y,w,d,h,mat) in pts:
        b.box((x,y,zt-h/2),(w,d,h),mat,ch=1.6)
        b.box((x,y,zt+.5),(w*.82,d*.82,1.2),rng.choice(['GREY','STEEL','GREY','WHITE2']))
        for _ in range(4):
            u=rng.uniform(-w*.3,w*.3);v=rng.uniform(-d*.3,d*.3);hh=rng.uniform(2,7)
            b.box((x+u,y+v,zt+1+hh/2),(rng.uniform(4,w*.35),rng.uniform(4,d*.35),hh),rng.choice(['GREY','STEEL','DARK','WHITE2']),ch=.6)
        for u in (-1,1):
            b.box((x+u*(w*.43),y,zt+.2),(1.2,d*.7,1.4),'YELLOW')
        for nx,ny in ((0,-1),(0,1),(1,0),(-1,0)):
            c=(x+nx*(w/2+.3),y+ny*(d/2+.3),zt-h*.45)
            bb=(w*.6,.6,h*.5) if nx==0 else (.6,d*.6,h*.5)
            b.box(c,bb,'DARK')
            c=(x+nx*(w/2+.7),y+ny*(d/2+.7),zt-h*.45)
            bb=(w*.3,.4,h*.2) if nx==0 else (.4,d*.3,h*.2)
            bd.box(c,bb,rng.choice(['AMBER','YELLOW','STEEL','BLUE']))
def build(seed=23):
    rng=random.Random(seed);b=B('cranes');t=B('towers');bd=B('fine3')
    # Grues : une par bras diagonal (seule position cohérente avec face, arrière et profil)
    for sx,sy in ((1,1),(-1,1),(-1,-1),(1,-1)):
        crane(b,bd,(sx*352,sy*352),(sx*192,sy*192),tail=34,tip=65,ztw=20)
    # tours hautes, sphères, tours de bout de bras (4 axes)
    for sx,sy in ((1,1),(-1,1),(-1,-1),(1,-1)):
        tall_tower(t,bd,sx*430,sy*441,sx,rng)
        sphere_mod(t,bd,sx*524,sy*524,rng);sphere_mod(t,bd,sx*494,sy*494,rng)
        side_tower(t,bd,sx*557,sy*90,1,rng,w=56,d=40);side_tower(t,bd,sx*90,sy*557,1,rng,w=40,d=40)
        tank_trio(t,bd,sx*436,sy*447,rng)
    # dômes flanquant la jetée
    for sx in (-1,1):
        t.push(None,(sx*74,-606,-82));t.R=t.R*.55
        t.lathe([(0,-30),(16,-29),(28,-20),(32,-6),(32,10),(26,24),(12,31),(0,32)],'SPHERE',n=20)
        t.lathe([(32.2,-1),(33,-.3),(33,1.8),(32.2,2.4)],'YELLOW',n=20)
        t.cyl((0,0,32),(0,0,38),6,'GREY',n=10)
        t.pop()
    # blocs suspendus sous l'anneau (sur l'anneau, jamais dans le vide)
    for sx,sy in ((1,1),(-1,1),(-1,-1),(1,-1)):
        x=sx*332;y=sy*400
        t.truss((x,y,-58),(x,y,Y(548)),26,26,2,'GREY',bar=1.4,chord=2.4,up=(1,0,0))
        t.box((x,y,Y(552)),(30,30,6),'YELLOW',ch=1)
    # rebords sous l'anneau (face : x ±230-300, y 525-540)
    for sx in (-1,1):
        for sy in (-1,1):
            x=sx*265;y=sy*(math.sqrt(max(0,520**2-265**2)))
            t.push(Rz(math.atan2(y,x)-math.pi/2),(x,y,Y(533)))
            t.box((0,0,0),(84,40,16),'GREY',ch=2);t.box((0,0,-8.5),(66,30,2),'WHITE2')
            t.pop()
    # modules de plan (bas) : silhouette du dessus sans gêner les élévations
    C1=[(-297,540,40,46,56,'GREY'),(-285,500,70,40,30,'STEEL'),(-362,500,44,40,34,'WHITE2'),(-405,455,44,36,30,'GREY'),(-335,475,30,20,26,'DARK')]
    low_cluster(t,bd,C1,rng,zt=68)
    C2=[(230,590,74,70,40,'GREY'),(285,560,46,60,44,'STEEL'),(180,560,40,50,30,'WHITE2'),(255,630,44,30,28,'DARK')]
    low_cluster(t,bd,C2,rng,zt=68)
    for x,y,r in ((-400,512,10),(-368,530,10),(300,630,11)):
        t.cyl((x,y,62),(x,y,70),4,'GREY',n=8);t.sphere((x,y,74),r,'SPHERE',n=14,m=8)
    # module droit (M4)
    C3=[(610,140,70,44,30,'GREY'),(650,105,60,46,34,'WHITE2'),(670,70,30,40,26,'STEEL')]
    low_cluster(t,bd,C3,rng,zt=44)
    t.cyl((610,120,42),(610,120,48),5,'GREY',n=8);t.sphere((610,120,50),12,'SPHERE',n=14,m=8)
    C4=[(-640,92,74,44,30,'GREY'),(-610,125,40,30,24,'STEEL')]
    low_cluster(t,bd,C4,rng,zt=46)
    # machines sur rayons X (vue de dessus) (y 26..58)
    for sg in (-1,1):
        for x,w,mat in ((sg*285,46,'WHITE2'),(sg*340,42,'STEEL'),(sg*395,30,'GREY')):
            low_cluster(t,bd,[(x,44,w,32,28,mat)],rng,zt=40)
    # mâts courts sur l'anneau, le moyeu et les bras
    for th in np.arange(4,360,15):
        if abs(((th-270+180)%360)-180)<12: continue
        a=math.radians(th);r=rng.choice([RI_:=462,566,512])
        x,y=r*math.cos(a),r*math.sin(a)
        if rng.random()<.6:
            t.cyl((x,y,62),(x,y,rng.uniform(72,88)),.9,'STEEL',n=5);zz=88
            t.sphere((x,y,t.V[-1][:,2].max()+1.2),2.29,'RED',n=8,m=5)
    return dict(cranes=b,towers=t,fine3=bd)
if __name__=='__main__':
    import sys;sys.path.insert(0,'.')
    import m1_ring,m2_core,ctl,zb,cv2
    A=B()
    for P in (m1_ring.build(),m2_core.build(),build()):
        for k,v in P.items(): A.merge(v)
    V,T,M=A.tris();print(len(T))
    res,S=ctl.scores(V,T)
    for v,r,rc in (('front','front','front_c'),('right','right','right'),('rear','rear','rear'),('top','top_c','top_c')):
        p=zb.render(V,T,M,v);d=ctl.diff_img(S[v],ctl.refmask(r));ref=cv2.imread(f'/home/claude/os01/ref/{rc}.png')
        row=np.hstack([ref,p,d]);cv2.imwrite(f'/home/claude/os01/ctl/m3_{v}.png',cv2.resize(row,None,fx=.55,fy=.55,interpolation=cv2.INTER_AREA))
