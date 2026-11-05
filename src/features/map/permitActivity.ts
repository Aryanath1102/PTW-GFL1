
export const PERMIT_ACTIVITY = [
  {id:'request', title:'Permit request', location:'PTFE Warehouse', color:0x38bdf8, description:'Requester prepares the job details on a tablet; a colleague checks the paper permit.'},
  {id:'approval', title:'Awaiting approval', location:'CPP Office', color:0xfbbf24, description:'The crew waits while the approver reviews the request. Work has not started.'},
  {id:'operator', title:'Area operator check', location:'Control Room', color:0xa78bfa, description:'The permit holder walks to the area operator for a site-readiness discussion.'},
  {id:'working', title:'Authorized work', location:'TFE Monomer Plant I', color:0x34d399, description:'An illustrative crew works inside a marked work zone after approval, acceptance and release.'},
  {id:'boiler', title:'Boiler electrical work', location:'H2 Boiler', color:0xfb923c, description:'Illustrative isolated electrical maintenance on a guarded boiler platform: an electrician checks a panel, a colleague handles tools and a supervisor reviews the permit. Platform and equipment are illustrative.'},
  {id:'drill', title:'Emergency response drill', location:'Fire Water Reservoir', color:0xf472b6, description:'A responder jogs along a short demonstration lane while colleagues coordinate a practice drill. This is an animation example, not a live emergency.'},
] as const;
export type ActivityId = typeof PERMIT_ACTIVITY[number]['id'];
export type ActivityMode = 'playing'|'paused'|'hidden';

