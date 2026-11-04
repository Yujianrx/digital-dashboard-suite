(function(root) {
  'use strict';
  root.createDashboardBrowserBackend=function(basePath) {
    var name='dashboard-browser-v2:'+basePath;
    var opened=new Promise(function(resolve,reject){
      var request=root.indexedDB.open(name,1);
      request.onupgradeneeded=function(){request.result.createObjectStore('values');request.result.createObjectStore('meta');};
      request.onerror=function(){reject(request.error);};
      request.onblocked=function(){reject(Error('浏览器数据库被旧页面占用，请关闭其他页面后重试'));};
      request.onsuccess=function(){var db=request.result;db.onversionchange=function(){db.close();};resolve(db);};
    });
    var channel=typeof root.BroadcastChannel==='function'?new root.BroadcastChannel(name):null;
    function transact(mode,action){return opened.then(function(db){return new Promise(function(resolve,reject){
      var tx=db.transaction(['values','meta'],mode),result,failure;
      tx.oncomplete=function(){resolve(result);};
      tx.onabort=function(){reject(failure||tx.error||Error('浏览器事务失败'));};
      function fail(error){failure=error;tx.abort();}
      try{action(tx,function(value){result=value;},fail);}catch(error){fail(error);}
    });});}
    function snapshot(){return transact('readonly',function(tx,done){
      var values=tx.objectStore('values'),keys=values.getAllKeys(),rows=values.getAll(),revision=tx.objectStore('meta').get('revision');
      revision.onsuccess=function(){var result=Object.create(null);keys.result.forEach(function(key,i){result[key]=rows.result[i];});done({values:result,revision:revision.result||0});};
    });}
    return {
      initialize:function(seed){return transact('readwrite',function(tx){
        var meta=tx.objectStore('meta'),request=meta.get('revision');
        request.onsuccess=function(){try{if(request.result===undefined){Object.keys(seed).forEach(function(key){tx.objectStore('values').put(String(seed[key]),key);});meta.put(1,'revision');}}catch(error){tx.abort();}};
      }).then(snapshot);},
      snapshot:snapshot,
      subscribe:function(callback){if(channel)channel.onmessage=callback;},
      commit:function(batch){return transact('readwrite',function(tx,done,fail){
        var values=tx.objectStore('values'),meta=tx.objectStore('meta'),revision=meta.get('revision');
        revision.onsuccess=function(){
          try {
          function conflict(){var error=Error('另一页面已修改相同数据，请先导出待保存数据，再加载最新数据核对');error.status=409;fail(error);}
          if(batch.clear&&revision.result!==batch.revision){conflict();return;}
          if(batch.clear)values.clear();
          batch.ops.forEach(function(op,key){
            var request=values.get(key);
            request.onsuccess=function(){
              if(!batch.clear&&request.result!==op.expected&&request.result!==(op.remove?undefined:op.value)){conflict();return;}
              try{if(op.remove)values.delete(key);else values.put(op.value,key);}catch(error){fail(error);}
            };
          });
          meta.put((revision.result||0)+1,'revision');
          } catch(error){fail(error);}
        };
      }).then(function(){if(channel)channel.postMessage('changed');return snapshot();});}
    };
  };
  root.createDashboardBrowserStorage=function(backend,basePath,seed,onChange) {
    var confirmed=Object.assign(Object.create(null),seed||{}),revision=0,generation=0,pending=new Map(),clearPending=false,inFlight=null,running=null;
    function status(state,message){if(onChange)onChange(state,message);}
    function apply(values,batch){values=batch.clear?Object.create(null):Object.assign(Object.create(null),values);batch.ops.forEach(function(op,name){if(op.remove)delete values[name];else values[name]=op.value;});return values;}
    function current(){var values=confirmed;if(inFlight)values=apply(values,inFlight);return apply(values,{ops:pending,clear:clearPending});}
    function accept(snapshot){confirmed=snapshot.values;revision=snapshot.revision;}
    var ready=backend.initialize(seed||{}).then(accept);
    function hasPending(){return !!inFlight||clearPending||pending.size>0;}
    function flush(){
      if(running)return running.then(flush);
      if(!clearPending&&!pending.size)return ready;
      var batch={ops:pending,clear:clearPending,revision:revision};pending=new Map();clearPending=false;inFlight=batch;
      status('saving','正在保存到此浏览器…');
      running=ready.then(function(){return backend.commit(batch);}).then(function(snapshot){
        accept(snapshot);inFlight=null;status(pending.size||clearPending?'pending':'saved',pending.size||clearPending?'待保存…':'已保存到此浏览器');
      }).catch(function(error){
        if(!clearPending){if(batch.clear)clearPending=true;batch.ops.forEach(function(op,name){if(!pending.has(name))pending.set(name,op);else pending.get(name).expected=op.expected;});}
        inFlight=null;status(error.status===409?'conflict':'error','浏览器保存失败：'+error.message);throw error;
      }).finally(function(){running=null;});
      return running.then(function(){if(pending.size||clearPending)return flush();});
    }
    function queue(name,op){generation++;name=String(name);op.expected=pending.has(name)?pending.get(name).expected:current()[name];pending.set(name,op);status('pending','待保存…');flush().catch(function(){});}
    return {
      ready:ready,
      get length(){return Object.keys(current()).length;},
      key:function(index){return Object.keys(current())[index]??null;},
      getItem:function(name){var values=current();return Object.prototype.hasOwnProperty.call(values,String(name))?values[String(name)]:null;},
      setItem:function(name,value){queue(name,{value:String(value)});},
      removeItem:function(name){queue(name,{remove:true});},
      clear:function(){generation++;clearPending=true;pending.clear();status('pending','待保存…');flush().catch(function(){});},
      exportValues:current,exportPending:current,flush:flush,hasPending:hasPending,subscribe:backend.subscribe,
      refresh:function(canApply){var observed=generation;return backend.snapshot().then(function(snapshot){if(!hasPending()&&observed===generation&&snapshot.revision>=revision&&(!canApply||canApply()))accept(snapshot);});},
      discard:function(){if(running)return Promise.reject(Error('正在保存，请稍后重试'));generation++;pending.clear();clearPending=false;return backend.snapshot().then(function(snapshot){accept(snapshot);status('saved','已加载浏览器数据');});},
      importValues:function(values){generation++;var before=current();Object.keys(values).forEach(function(name){pending.set(name,{value:values[name],expected:pending.has(name)?pending.get(name).expected:before[name]});});return flush();}
    };
  };
})(window);
