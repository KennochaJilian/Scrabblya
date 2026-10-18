import type { BoardBounds } from './dropTarget';
import type { Placement } from './engine';
export function rackSlotAtPoint(x:number,y:number,bounds:BoardBounds|null,count:number,tileSize?:number):number|null {
 if(!bounds||count<1||bounds.width<=18||x<bounds.x||x>=bounds.x+bounds.width||y<bounds.y||y>=bounds.y+bounds.height)return null;
 const slot=tileSize!==undefined?tileSize+4:(bounds.width-18+5)/count;
 const left=tileSize!==undefined?(bounds.width-count*tileSize-(count-1)*4)/2:9;
 return Math.max(0,Math.min(count-1,Math.floor((x-bounds.x-left+(tileSize!==undefined?2:2.5))/slot)));
}
export function reorderRack(order:number[],index:number,target:number,rackLength:number):number[]{
 const visible=order.filter(i=>i<rackLength),from=visible.indexOf(index);
 if(from<0||target<0||target>=visible.length)return order;
 visible.splice(from,1);visible.splice(target,0,index);
 return [...visible,...order.filter(i=>i>=rackLength)];
}
export function relocateDraft(draft:Placement[],index:number,cell:number,occupied:boolean):Placement[]{
 if(occupied||draft.some(p=>p.cell===cell&&p.rackIndex!==index))return draft;
 return draft.map(p=>p.rackIndex===index?{...p,cell}:p);
}

