import path from 'node:path';
export function readVisualOptions(env=process.env){
 const port=env.STOVO_VISUAL_PORT??'5174';if(!/^\d{1,5}$/.test(port)||Number(port)<1024||Number(port)>65535)throw Error('Visual tests require a valid unprivileged loopback port');
 const origin=`http://127.0.0.1:${port}`;if(env.STOVO_VISUAL_URL && env.STOVO_VISUAL_URL!==origin)throw Error('Visual tests require the loopback mock origin '+origin);
 return {origin,port:Number(port),output:path.resolve(env.STOVO_VISUAL_OUTPUT || '../artifacts/agent-workflows/visual')};
}
