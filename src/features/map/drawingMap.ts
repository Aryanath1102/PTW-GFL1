import data from './drawingLocations.json';
export const DRAWING = data;
export type DrawingLocation = typeof data.locations[number];
export const DRAWING_IMAGE = './maps/gfl-a-d1376.png';
export const DRAWING_PDF = './maps/GFL-COM-CIVL-LYOD-D1376.pdf';
export const drawingWorld = (point: {x:number;y:number}) => ({x:point.x-DRAWING.width/2,z:point.y-DRAWING.height/2});
