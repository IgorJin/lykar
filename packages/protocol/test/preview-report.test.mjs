import test from 'node:test';
import assert from 'node:assert/strict';
import {isPreviewCheckReport, isPreviewCheckRequest} from '../dist/index.js';
const request={type:'lykar:preview-check',schemaVersion:1,nonce:'nonce-with-16-characters',pageId:'page',releaseId:'release'};
const report={...request,type:'lykar:preview-report',projectKey:'pk_test',version:1,checkedAt:'2026-10-04T00:00:00.000Z',sourceStatus:'unknown',operations:[{id:'op',kind:'setText',status:'skipped',code:'TARGET_NOT_FOUND'}]};
test('preview challenge and point-in-time report validate bounded transport data',()=>{
 assert.equal(isPreviewCheckRequest(request),true);assert.equal(isPreviewCheckReport(report),true);
 for(const change of [{schemaVersion:2},{nonce:'short'},{pageId:''},{releaseId:null}])assert.equal(isPreviewCheckRequest({...request,...change}),false);
 for(const change of [{version:0},{version:1.5},{checkedAt:'invalid'},{sourceStatus:'verified'},{operations:[{id:'op',kind:'setText',status:'success'}]},{operations:Array(1001).fill(report.operations[0])}])assert.equal(isPreviewCheckReport({...report,...change}),false);
 for(const value of [null,undefined,[],1,'report'])assert.equal(isPreviewCheckReport(value),false);
});
