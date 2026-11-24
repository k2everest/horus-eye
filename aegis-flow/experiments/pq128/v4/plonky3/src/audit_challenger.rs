//! Read-only, native Fiat-Shamir observer used ONLY with audited verification.
//! The wrapped Plonky3 challenger is delegated unmodified. This exposes
//! actual base-/extension-field samples, query bit draws, and opaque absorbs.
//! It is NOT a proof of oracle extraction or cryptographic soundness.
use std::{any::type_name,sync::{Arc,Mutex}};
use p3_challenger::{CanObserve,CanSample,CanSampleBits,FieldChallenger,GrindingChallenger};
use serde::Serialize;
use crate::{Chall,E,F};

#[derive(Clone,Debug,Serialize)]
pub(crate) struct ChallengeEvent {
    pub seq:usize,
    pub operation:&'static str,
    pub type_name:&'static str,
    pub value:Option<String>,
    pub bits:Option<usize>,
}
#[derive(Clone,Debug)]
pub(crate) struct AuditedChallenger {
    inner:Chall,
    events:Arc<Mutex<Vec<ChallengeEvent>>>,
}
impl AuditedChallenger {
    pub(crate) fn new(inner:Chall)->Self{
        Self{inner,events:Arc::new(Mutex::new(Vec::new()))}
    }
    pub(crate) fn events(&self)->Vec<ChallengeEvent>{
        self.events.lock().expect("audit mutex").clone()
    }
    fn record(&self,operation:&'static str,ty:&'static str,
        value:Option<String>,bits:Option<usize>){
        let mut events=self.events.lock().expect("audit mutex");
        let seq=events.len();
        events.push(ChallengeEvent{seq,operation,type_name:ty,value,bits});
    }
}
impl<T> CanObserve<T> for AuditedChallenger where Chall:CanObserve<T> {
    fn observe(&mut self,value:T){
        self.record("observe",type_name::<T>(),None,None);
        self.inner.observe(value);
    }
}
impl CanSample<F> for AuditedChallenger {
    fn sample(&mut self)->F{
        let x: F=self.inner.sample();
        self.record("sample_base",type_name::<F>(),Some(format!("{x:?}")),None);
        x
    }
}
impl CanSample<E> for AuditedChallenger {
    fn sample(&mut self)->E{
        let x:E=self.inner.sample();
        self.record("sample_extension",type_name::<E>(),Some(format!("{x:?}")),None);
        x
    }
}
impl CanSampleBits<usize> for AuditedChallenger{
    fn sample_bits(&mut self,bits:usize)->usize{
        let x=self.inner.sample_bits(bits);
        self.record("sample_bits",type_name::<usize>(),Some(x.to_string()),Some(bits));
        x
    }
}
impl FieldChallenger<F> for AuditedChallenger {}
impl GrindingChallenger for AuditedChallenger {
    type Witness=F;
    fn grind(&mut self,bits:usize)->F {
        let value=self.inner.grind(bits);
        self.record("grind",type_name::<F>(),Some(format!("{value:?}")),Some(bits));
        value
    }
}
