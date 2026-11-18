import {test,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({invoke:vi.fn(async()=>({data:{data:{result:{height:1}}},error:null}))}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:mocks.invoke}}}));
import {loadNodeConfig,defaultConfig,callMoneroRpc} from './monero-rpc';
test('legacy RPC passwords are removed and never forwarded to the edge function',async()=>{
 localStorage.setItem('monero-node-config',JSON.stringify({...defaultConfig,username:'private-user',password:'private-password'}));
 const loaded=loadNodeConfig();expect(localStorage.getItem('monero-node-config')).toBeNull();expect(loaded.password).toBe('');
 await callMoneroRpc({...defaultConfig,password:'never-forward',host:'127.0.0.1'},'get_info');
 expect(mocks.invoke).toHaveBeenCalledWith('monero-rpc',{body:{method:'get_info',params:{}}});
});
