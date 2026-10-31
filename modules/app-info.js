// 应用版本单一来源。
//
// 错误上报（FR-C3）需要带版本号，但扩展端能读 chrome.runtime.getManifest()、
// 站点端读不到，所以这里保留一份常量。它与 package.json / manifest.json
// 必须三者一致，由 tests/app-info.test.mjs 断言，防止发版时漏改某一处。
export const APP_VERSION = "1.0.0";
