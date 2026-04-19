package de.janpiotrowski.ionic.epubjs.plugins;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.view.View;
import android.webkit.WebSettings;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaInterface;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CordovaWebView;
import org.apache.cordova.engine.SystemWebView;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Iterator;
import android.util.Base64;

public class WebViewMixedContent extends CordovaPlugin {
    private static final int REQUEST_BOOKS_DIRECTORY = 8142;
    private static final String PREFS_NAME = "eink_reader_books";
    private static final String PREF_BOOKS_TREE_URI = "books_tree_uri";
    private CallbackContext chooseDirectoryCallback;

    @Override
    public void initialize(CordovaInterface cordova, CordovaWebView webView) {
        super.initialize(cordova, webView);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return;
        }

        cordova.getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                View view = WebViewMixedContent.this.webView.getView();
                if (view instanceof SystemWebView) {
                    ((SystemWebView) view).getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                }
            }
        });
    }

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException {
        if ("request".equals(action)) {
            JSONObject options = args.getJSONObject(0);
            cordova.getThreadPool().execute(new Runnable() {
                @Override
                public void run() {
                    performRequest(options, callbackContext);
                }
            });

            return true;
        }

        if ("downloadFile".equals(action)) {
            JSONObject options = args.getJSONObject(0);
            cordova.getThreadPool().execute(new Runnable() {
                @Override
                public void run() {
                    downloadFile(options, callbackContext);
                }
            });

            return true;
        }

        if ("readFile".equals(action)) {
            JSONObject options = args.getJSONObject(0);
            cordova.getThreadPool().execute(new Runnable() {
                @Override
                public void run() {
                    readFile(options, callbackContext);
                }
            });

            return true;
        }

        if ("listBooks".equals(action)) {
            cordova.getThreadPool().execute(new Runnable() {
                @Override
                public void run() {
                    listBooks(callbackContext);
                }
            });

            return true;
        }

        if ("deleteBook".equals(action)) {
            JSONObject options = args.getJSONObject(0);
            cordova.getThreadPool().execute(new Runnable() {
                @Override
                public void run() {
                    deleteBook(options, callbackContext);
                }
            });

            return true;
        }

        if ("chooseBooksDirectory".equals(action)) {
            chooseBooksDirectory(callbackContext);
            return true;
        }

        if ("getBooksDirectory".equals(action)) {
            callbackContext.success(getBooksDirectoryResult());
            return true;
        }

        if ("resetBooksDirectory".equals(action)) {
            resetBooksDirectory();
            callbackContext.success(getBooksDirectoryResult());
            return true;
        }

        return false;
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent intent) {
        if (requestCode != REQUEST_BOOKS_DIRECTORY) {
            return;
        }

        CallbackContext callback = chooseDirectoryCallback;
        chooseDirectoryCallback = null;

        if (callback == null) {
            return;
        }

        if (resultCode != Activity.RESULT_OK || intent == null || intent.getData() == null) {
            callback.error("No folder selected");
            return;
        }

        Uri treeUri = intent.getData();
        int flags = intent.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            cordova.getActivity().getContentResolver().takePersistableUriPermission(treeUri, flags);
        } catch (Exception ignored) {
        }

        getPrefs().edit().putString(PREF_BOOKS_TREE_URI, treeUri.toString()).apply();
        callback.success(getBooksDirectoryResult());
    }

    private void performRequest(JSONObject options, CallbackContext callbackContext) {
        HttpURLConnection connection = null;

        try {
            URL url = new URL(options.getString("url"));
            String method = options.optString("method", "GET").toUpperCase();
            JSONObject headers = options.optJSONObject("headers");
            String body = options.optString("body", "");

            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setRequestMethod(method);
            connection.setDoInput(true);

            if (headers != null) {
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    connection.setRequestProperty(key, headers.optString(key));
                }
            }

            if (body.length() > 0) {
                byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(bodyBytes.length);
                OutputStream outputStream = connection.getOutputStream();
                outputStream.write(bodyBytes);
                outputStream.close();
            }

            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            JSONObject result = new JSONObject();
            result.put("status", status);
            result.put("body", readStream(stream));
            callbackContext.success(result);
        } catch (Exception error) {
            callbackContext.error(error.getMessage());
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private String readStream(InputStream stream) throws java.io.IOException {
        if (stream == null) {
            return "";
        }

        BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
        StringBuilder builder = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            builder.append(line);
        }
        reader.close();
        return builder.toString();
    }

    private void downloadFile(JSONObject options, CallbackContext callbackContext) {
        if (getSelectedTreeUri() != null) {
            downloadFileToTree(options, callbackContext);
            return;
        }

        HttpURLConnection connection = null;
        InputStream inputStream = null;
        FileOutputStream outputStream = null;

        try {
            URL url = new URL(options.getString("url"));
            JSONObject headers = options.optJSONObject("headers");
            String fileName = sanitizeFileName(options.optString("fileName", "book.epub"));
            if (!fileName.toLowerCase().endsWith(".epub")) {
                fileName = fileName + ".epub";
            }

            File booksDir = getBooksDir();
            if (!booksDir.exists() && !booksDir.mkdirs()) {
                throw new java.io.IOException("Unable to create books directory");
            }

            File outputFile = new File(booksDir, fileName);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(60000);
            connection.setRequestMethod("GET");
            connection.setDoInput(true);

            if (headers != null) {
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    connection.setRequestProperty(key, headers.optString(key));
                }
            }

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new java.io.IOException("Download failed: HTTP " + status);
            }

            inputStream = connection.getInputStream();
            outputStream = new FileOutputStream(outputFile);
            byte[] buffer = new byte[16384];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }

            JSONObject result = new JSONObject();
            result.put("path", outputFile.getAbsolutePath());
            result.put("fileName", outputFile.getName());
            result.put("size", outputFile.length());
            result.put("directory", booksDir.getAbsolutePath());
            callbackContext.success(result);
        } catch (Exception error) {
            callbackContext.error(error.getMessage());
        } finally {
            closeQuietly(outputStream);
            closeQuietly(inputStream);
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private void readFile(JSONObject options, CallbackContext callbackContext) {
        String path = options.optString("path", "");
        if (path.startsWith("content://")) {
            readContentFile(Uri.parse(path), callbackContext);
            return;
        }

        FileInputStream inputStream = null;

        try {
            File file = new File(path);
            if (!isInsideBooksDir(file)) {
                throw new java.io.IOException("File is outside the books directory");
            }

            inputStream = new FileInputStream(file);
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            byte[] buffer = new byte[16384];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }

            JSONObject result = new JSONObject();
            result.put("base64", Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP));
            result.put("size", file.length());
            callbackContext.success(result);
        } catch (Exception error) {
            callbackContext.error(error.getMessage());
        } finally {
            closeQuietly(inputStream);
        }
    }

    private void listBooks(CallbackContext callbackContext) {
        Uri treeUri = getSelectedTreeUri();
        if (treeUri != null) {
            listTreeBooks(treeUri, callbackContext);
            return;
        }

        try {
            File booksDir = getBooksDir();
            if (!booksDir.exists() && !booksDir.mkdirs()) {
                throw new java.io.IOException("Unable to create books directory");
            }

            File[] files = booksDir.listFiles();
            JSONArray books = new JSONArray();

            if (files != null) {
                Arrays.sort(files, new Comparator<File>() {
                    @Override
                    public int compare(File left, File right) {
                        return left.getName().compareToIgnoreCase(right.getName());
                    }
                });

                for (File file : files) {
                    if (!file.isFile() || !file.getName().toLowerCase().endsWith(".epub")) {
                        continue;
                    }

                    JSONObject book = new JSONObject();
                    book.put("name", stripEpubExtension(file.getName()));
                    book.put("fileName", file.getName());
                    book.put("path", file.getAbsolutePath());
                    book.put("size", file.length());
                    book.put("lastModified", file.lastModified());
                    books.put(book);
                }
            }

            JSONObject result = new JSONObject();
            result.put("directory", booksDir.getAbsolutePath());
            result.put("books", books);
            result.put("custom", false);
            callbackContext.success(result);
        } catch (Exception error) {
            callbackContext.error(error.getMessage());
        }
    }

    private void deleteBook(JSONObject options, CallbackContext callbackContext) {
        String path = options.optString("path", "");
        if (path.length() == 0) {
            callbackContext.error("Missing book path");
            return;
        }

        if (path.startsWith("content://")) {
            deleteContentBook(Uri.parse(path), callbackContext);
            return;
        }

        try {
            File file = new File(path);
            if (!isInsideBooksDir(file)) {
                throw new java.io.IOException("File is outside the books directory");
            }

            if (!file.isFile() || !file.getName().toLowerCase().endsWith(".epub")) {
                throw new java.io.IOException("Only EPUB files can be deleted");
            }

            if (!file.delete()) {
                throw new java.io.IOException("Unable to delete book file");
            }

            JSONObject result = new JSONObject();
            result.put("path", path);
            result.put("deleted", true);
            callbackContext.success(result);
        } catch (Exception error) {
            callbackContext.error(error.getMessage());
        }
    }

    private void deleteContentBook(Uri uri, CallbackContext callbackContext) {
        try {
            if (!isInsideSelectedTree(uri)) {
                throw new java.io.IOException("File is outside the books directory");
            }

            if (!DocumentsContract.deleteDocument(cordova.getActivity().getContentResolver(), uri)) {
                throw new java.io.IOException("Unable to delete book file");
            }

            JSONObject result = new JSONObject();
            result.put("path", uri.toString());
            result.put("deleted", true);
            callbackContext.success(result);
        } catch (Exception error) {
            callbackContext.error(error.getMessage());
        }
    }

    private void chooseBooksDirectory(CallbackContext callbackContext) {
        if (chooseDirectoryCallback != null) {
            callbackContext.error("Folder selection already in progress");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);

        chooseDirectoryCallback = callbackContext;
        try {
            cordova.startActivityForResult(this, intent, REQUEST_BOOKS_DIRECTORY);
        } catch (ActivityNotFoundException error) {
            chooseDirectoryCallback = null;
            callbackContext.error("Folder picker is not available");
        }
    }

    private void resetBooksDirectory() {
        Uri treeUri = getSelectedTreeUri();
        if (treeUri != null) {
            try {
                cordova.getActivity().getContentResolver().releasePersistableUriPermission(
                    treeUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );
            } catch (Exception ignored) {
            }
        }

        getPrefs().edit().remove(PREF_BOOKS_TREE_URI).apply();
    }

    private void downloadFileToTree(JSONObject options, CallbackContext callbackContext) {
        HttpURLConnection connection = null;
        InputStream inputStream = null;
        OutputStream outputStream = null;

        try {
            Uri treeUri = getSelectedTreeUri();
            if (treeUri == null) {
                throw new java.io.IOException("Books directory is not configured");
            }

            URL url = new URL(options.getString("url"));
            JSONObject headers = options.optJSONObject("headers");
            String fileName = sanitizeFileName(options.optString("fileName", "book.epub"));
            if (!fileName.toLowerCase().endsWith(".epub")) {
                fileName = fileName + ".epub";
            }

            Uri existingUri = findTreeChildByName(treeUri, fileName);
            if (existingUri != null) {
                DocumentsContract.deleteDocument(cordova.getActivity().getContentResolver(), existingUri);
            }

            Uri parentUri = getTreeDocumentUri(treeUri);
            Uri outputUri = DocumentsContract.createDocument(
                cordova.getActivity().getContentResolver(),
                parentUri,
                "application/epub+zip",
                fileName
            );
            if (outputUri == null) {
                throw new java.io.IOException("Unable to create book file");
            }

            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(60000);
            connection.setRequestMethod("GET");
            connection.setDoInput(true);

            if (headers != null) {
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    connection.setRequestProperty(key, headers.optString(key));
                }
            }

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new java.io.IOException("Download failed: HTTP " + status);
            }

            inputStream = connection.getInputStream();
            outputStream = cordova.getActivity().getContentResolver().openOutputStream(outputUri, "wt");
            if (outputStream == null) {
                throw new java.io.IOException("Unable to write book file");
            }

            byte[] buffer = new byte[16384];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }
            closeQuietly(outputStream);
            outputStream = null;

            JSONObject result = new JSONObject();
            result.put("path", outputUri.toString());
            result.put("fileName", fileName);
            result.put("size", getContentFileSize(outputUri));
            result.put("directory", getDirectoryLabel(treeUri));
            callbackContext.success(result);
        } catch (Exception error) {
            callbackContext.error(error.getMessage());
        } finally {
            closeQuietly(outputStream);
            closeQuietly(inputStream);
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private void readContentFile(Uri uri, CallbackContext callbackContext) {
        InputStream inputStream = null;

        try {
            if (!isInsideSelectedTree(uri)) {
                throw new java.io.IOException("File is outside the books directory");
            }

            inputStream = cordova.getActivity().getContentResolver().openInputStream(uri);
            if (inputStream == null) {
                throw new java.io.IOException("Unable to open book file");
            }

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            byte[] buffer = new byte[16384];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }

            JSONObject result = new JSONObject();
            result.put("base64", Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP));
            result.put("size", getContentFileSize(uri));
            callbackContext.success(result);
        } catch (Exception error) {
            callbackContext.error(error.getMessage());
        } finally {
            closeQuietly(inputStream);
        }
    }

    private void listTreeBooks(Uri treeUri, CallbackContext callbackContext) {
        Cursor cursor = null;

        try {
            ContentResolver resolver = cordova.getActivity().getContentResolver();
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(
                treeUri,
                DocumentsContract.getTreeDocumentId(treeUri)
            );
            JSONArray books = new JSONArray();
            String[] projection = new String[] {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_SIZE,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
                DocumentsContract.Document.COLUMN_LAST_MODIFIED
            };

            cursor = resolver.query(childrenUri, projection, null, null, null);
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String documentId = cursor.getString(0);
                    String fileName = cursor.getString(1);
                    long size = cursor.isNull(2) ? 0 : cursor.getLong(2);
                    String mimeType = cursor.getString(3);
                    long lastModified = cursor.isNull(4) ? 0 : cursor.getLong(4);

                    if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mimeType) || fileName == null || !fileName.toLowerCase().endsWith(".epub")) {
                        continue;
                    }

                    Uri documentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
                    JSONObject book = new JSONObject();
                    book.put("name", stripEpubExtension(fileName));
                    book.put("fileName", fileName);
                    book.put("path", documentUri.toString());
                    book.put("size", size);
                    book.put("lastModified", lastModified);
                    books.put(book);
                }
            }

            JSONObject result = new JSONObject();
            result.put("directory", getDirectoryLabel(treeUri));
            result.put("books", books);
            result.put("custom", true);
            callbackContext.success(result);
        } catch (Exception error) {
            callbackContext.error(error.getMessage());
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
    }

    private File getBooksDir() {
        File externalBooksDir = cordova.getActivity().getExternalFilesDir("Books");
        if (externalBooksDir != null) {
            return externalBooksDir;
        }

        return new File(cordova.getActivity().getFilesDir(), "books");
    }

    private SharedPreferences getPrefs() {
        return cordova.getActivity().getSharedPreferences(PREFS_NAME, Activity.MODE_PRIVATE);
    }

    private Uri getSelectedTreeUri() {
        String value = getPrefs().getString(PREF_BOOKS_TREE_URI, "");
        if (value == null || value.length() == 0) {
            return null;
        }

        return Uri.parse(value);
    }

    private JSONObject getBooksDirectoryResult() {
        JSONObject result = new JSONObject();
        try {
            Uri treeUri = getSelectedTreeUri();
            if (treeUri != null) {
                result.put("directory", getDirectoryLabel(treeUri));
                result.put("uri", treeUri.toString());
                result.put("custom", true);
                return result;
            }

            File booksDir = getBooksDir();
            result.put("directory", booksDir.getAbsolutePath());
            result.put("uri", "");
            result.put("custom", false);
        } catch (Exception error) {
            try {
                result.put("directory", "");
                result.put("uri", "");
                result.put("custom", false);
            } catch (Exception ignored) {
            }
        }

        return result;
    }

    private Uri getTreeDocumentUri(Uri treeUri) {
        return DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri));
    }

    private Uri findTreeChildByName(Uri treeUri, String fileName) {
        Cursor cursor = null;

        try {
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(
                treeUri,
                DocumentsContract.getTreeDocumentId(treeUri)
            );
            cursor = cordova.getActivity().getContentResolver().query(
                childrenUri,
                new String[] {
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME
                },
                null,
                null,
                null
            );

            if (cursor == null) {
                return null;
            }

            while (cursor.moveToNext()) {
                String documentId = cursor.getString(0);
                String displayName = cursor.getString(1);
                if (fileName.equalsIgnoreCase(displayName)) {
                    return DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }

        return null;
    }

    private long getContentFileSize(Uri uri) {
        Cursor cursor = null;

        try {
            cursor = cordova.getActivity().getContentResolver().query(
                uri,
                new String[] { DocumentsContract.Document.COLUMN_SIZE },
                null,
                null,
                null
            );

            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) {
                return cursor.getLong(0);
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }

        return 0;
    }

    private String getDirectoryLabel(Uri treeUri) {
        String treeDocumentId = DocumentsContract.getTreeDocumentId(treeUri);
        if (treeDocumentId == null || treeDocumentId.length() == 0) {
            return treeUri.toString();
        }

        return treeDocumentId.replace("primary:", "Internal storage/");
    }

    private boolean isInsideSelectedTree(Uri uri) {
        Uri treeUri = getSelectedTreeUri();
        if (treeUri == null) {
            return false;
        }

        try {
            String treeDocumentId = DocumentsContract.getTreeDocumentId(treeUri);
            String documentId = DocumentsContract.getDocumentId(uri);
            return documentId.equals(treeDocumentId) || documentId.startsWith(treeDocumentId + "/");
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isInsideBooksDir(File file) throws java.io.IOException {
        File booksDir = getBooksDir();
        String canonicalFile = file.getCanonicalPath();
        String canonicalBooksDir = booksDir.getCanonicalPath();

        return canonicalFile.equals(canonicalBooksDir) || canonicalFile.startsWith(canonicalBooksDir + File.separator);
    }

    private String sanitizeFileName(String fileName) {
        return fileName.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
    }

    private String stripEpubExtension(String fileName) {
        if (fileName.toLowerCase().endsWith(".epub")) {
            return fileName.substring(0, fileName.length() - 5);
        }

        return fileName;
    }

    private void closeQuietly(java.io.Closeable closeable) {
        if (closeable == null) {
            return;
        }

        try {
            closeable.close();
        } catch (Exception ignored) {
        }
    }
}
