import numpy as np,cv2,sys
def comp(p,o,bg=(12,12,14)):
    im=cv2.imread(p,-1).astype(np.float32)/255
    a=im[...,3:];rgb=im[...,:3]
    # halo sur émissifs
    sat=rgb.max(axis=2)-rgb.min(axis=2);hi=rgb*(sat[...,None]>.45)*(rgb.max(axis=2,keepdims=True)>.9)*(rgb.min(axis=2,keepdims=True)<.35)
    g=cv2.GaussianBlur(hi,(0,0),2.5)*.5+cv2.GaussianBlur(hi,(0,0),9)*.45
    out=rgb*a+np.array(bg)/255*(1-a)+g
    cv2.imwrite(o,(np.clip(out,0,1)*255).astype(np.uint8))
if __name__=='__main__':
    for p in sys.argv[1:]:
        comp(p,p.replace('.png','_c.png'))
