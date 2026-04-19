var exec = require('cordova/exec');

exports.request = function (options) {
  return new Promise(function (resolve, reject) {
    exec(resolve, reject, 'WebViewMixedContent', 'request', [options]);
  });
};

exports.downloadFile = function (options) {
  return new Promise(function (resolve, reject) {
    exec(resolve, reject, 'WebViewMixedContent', 'downloadFile', [options]);
  });
};

exports.readFile = function (options) {
  return new Promise(function (resolve, reject) {
    exec(resolve, reject, 'WebViewMixedContent', 'readFile', [options]);
  });
};

exports.listBooks = function () {
  return new Promise(function (resolve, reject) {
    exec(resolve, reject, 'WebViewMixedContent', 'listBooks', [{}]);
  });
};

exports.deleteBook = function (options) {
  return new Promise(function (resolve, reject) {
    exec(resolve, reject, 'WebViewMixedContent', 'deleteBook', [options || {}]);
  });
};

exports.chooseBooksDirectory = function () {
  return new Promise(function (resolve, reject) {
    exec(resolve, reject, 'WebViewMixedContent', 'chooseBooksDirectory', [{}]);
  });
};

exports.getBooksDirectory = function () {
  return new Promise(function (resolve, reject) {
    exec(resolve, reject, 'WebViewMixedContent', 'getBooksDirectory', [{}]);
  });
};

exports.resetBooksDirectory = function () {
  return new Promise(function (resolve, reject) {
    exec(resolve, reject, 'WebViewMixedContent', 'resetBooksDirectory', [{}]);
  });
};
