import path from 'node:path';
export function readVisualOptions(env=process.env){
 const origin='http://127.0.0.1:5174';if(env.STOVO_VISUAL_URL && env.STOVO_VISUAL_URL!==origin)throw Error('Visual tests require the fixed local mock origin '+origin);
 return {origin,output:path.resolve(env.STOVO_VISUAL_OUTPUT || '../artifacts/agent-workflows/visual')};
}
