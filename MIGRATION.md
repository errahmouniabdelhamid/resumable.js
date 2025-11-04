# Migration Guide: XHR to Livewire Edition

This guide helps you migrate from the original XHR-based resumable.js to the Livewire edition.

## Key Differences

### 1. Upload Mechanism

**Original (XHR):**
```javascript
const resumable = new Resumable({
    target: '/upload/endpoint',
    testTarget: '/test/endpoint',
});
```

**Livewire Edition:**
```javascript
const resumable = new Resumable({
    livewireComponent: @this,  // or $wire
    livewireProperty: 'upload',
});
```

### 2. Build System

**Original:** Uses TypeScript + Webpack
**Livewire Edition:** Uses JavaScript (ES6) + Vite

### 3. File Format

**Original:**
- TypeScript source files in `src/`
- Outputs `dist/main.js` and `dist/helpers.js`

**Livewire Edition:**
- JavaScript source files in `js/`
- Outputs `dist/resumable-livewire.es.js` (ES modules) and `dist/resumable-livewire.umd.js` (UMD)

## What Stays the Same

✅ **All public API methods** - No breaking changes to the API
✅ **Event system** - Same events with same parameters
✅ **File validation** - Same validation logic
✅ **Chunking logic** - Same chunking algorithm
✅ **Configuration options** - Most options remain identical

## Migration Steps

### 1. Update Dependencies

```bash
npm install @pointcloudtechnology/resumablejs@^5.0.0
```

### 2. Update Import Statement

**ES Modules:**
```javascript
// Before
import Resumable from '@pointcloudtechnology/resumablejs';

// After (same)
import Resumable from '@pointcloudtechnology/resumablejs';
```

**UMD/Browser:**
```html
<!-- Before -->
<script src="node_modules/@pointcloudtechnology/resumablejs/dist/main.js"></script>

<!-- After -->
<script src="node_modules/@pointcloudtechnology/resumablejs/dist/resumable-livewire.umd.js"></script>
```

### 3. Update Configuration

```javascript
// Before - XHR version
const resumable = new Resumable({
    target: '/api/upload',
    testTarget: '/api/test-chunk',
    chunkSize: 1024 * 1024,
    simultaneousUploads: 3,
});

// After - Livewire version
const resumable = new Resumable({
    livewireComponent: @this,  // Pass Livewire component reference
    livewireProperty: 'upload', // Property name for uploads
    chunkSize: 1024 * 1024,
    simultaneousUploads: 3,
    testChunks: false, // Usually disabled with Livewire
});
```

### 4. Update Server-Side Handling

**Before (XHR endpoint):**
```php
// routes/api.php
Route::post('/upload', [UploadController::class, 'upload']);

// UploadController.php
public function upload(Request $request)
{
    $chunk = $request->file('file');
    $chunkNumber = $request->input('resumableChunkNumber');
    // ... handle chunk
}
```

**After (Livewire component):**
```php
// app/Http/Livewire/FileUploader.php
use Livewire\Component;
use Livewire\WithFileUploads;

class FileUploader extends Component
{
    use WithFileUploads;

    public $upload;
    
    public function updatedUpload()
    {
        // Chunk is automatically uploaded via Livewire
        // Access chunk metadata via request() helper
        $chunkNumber = request('resumableChunkNumber');
        $totalChunks = request('resumableTotalChunks');
        
        // ... handle chunk
    }
}
```

### 5. Update Event Handlers (No Changes Needed!)

```javascript
// Event handlers work exactly the same
resumable.on('fileAdded', (file) => {
    console.log('File added:', file.fileName);
});

resumable.on('fileProgress', (file) => {
    console.log('Progress:', file.progress());
});

resumable.on('fileSuccess', (file, message) => {
    console.log('Upload complete:', file.fileName);
});
```

## Common Gotchas

### 1. Livewire Component Reference

❌ **Wrong:**
```javascript
const resumable = new Resumable({
    livewireComponent: null, // Missing!
});
```

✅ **Correct:**
```javascript
const resumable = new Resumable({
    livewireComponent: @this, // In Blade template
    // or
    livewireComponent: Livewire.find(componentId), // In external JS
});
```

### 2. Test Chunks

With Livewire, you usually want to disable test chunks:

```javascript
const resumable = new Resumable({
    testChunks: false, // Disable for Livewire
});
```

### 3. Chunk Metadata

Chunk metadata is passed automatically but you need to handle it on the server:

```php
public function updatedUpload()
{
    $metadata = [
        'chunkNumber' => request('resumableChunkNumber'),
        'chunkSize' => request('resumableChunkSize'),
        'totalSize' => request('resumableTotalSize'),
        'identifier' => request('resumableIdentifier'),
        'filename' => request('resumableFilename'),
        'totalChunks' => request('resumableTotalChunks'),
    ];
    
    // Use metadata to reassemble file
}
```

## Feature Compatibility Matrix

| Feature | XHR Version | Livewire Version |
|---------|-------------|------------------|
| Chunked uploads | ✅ | ✅ |
| Resume/pause | ✅ | ✅ |
| Progress tracking | ✅ | ✅ |
| File validation | ✅ | ✅ |
| Multiple files | ✅ | ✅ |
| Drag & drop | ✅ | ✅ |
| File categories | ✅ | ✅ |
| Custom validators | ✅ | ✅ |
| Events | ✅ | ✅ |
| XHR customization | ✅ | ❌ |
| HTTP headers | ✅ | ❌* |
| Livewire integration | ❌ | ✅ |

*Headers are managed by Livewire

## Performance Considerations

### Chunk Size
Both versions support the same chunk sizes, but consider:
- **Livewire**: May have slightly higher overhead per chunk due to Livewire's request cycle
- **Recommendation**: Use slightly larger chunks (2-5MB) with Livewire

### Simultaneous Uploads
```javascript
// Good for most cases
simultaneousUploads: 3

// For high-performance servers
simultaneousUploads: 5

// For limited bandwidth
simultaneousUploads: 1
```

## Troubleshooting

### Upload Not Starting

**Check 1:** Livewire component reference
```javascript
console.log(resumable.livewireComponent); // Should not be null
```

**Check 2:** Property binding
```php
// In Livewire component
public $upload; // Must exist
```

### Chunks Not Reassembling

**Check:** Verify all chunks received
```php
public function updatedUpload()
{
    $chunkNumber = request('resumableChunkNumber');
    Log::info("Received chunk: {$chunkNumber}");
    // ... rest of handling
}
```

### Progress Not Updating

**Check:** Event listeners
```javascript
resumable.on('fileProgress', (file) => {
    console.log('Progress:', file.progress()); // Should log
});
```

## Need Help?

- See [README-LIVEWIRE.md](README-LIVEWIRE.md) for full documentation
- Check [example-livewire.html](example-livewire.html) for working example
- Review the original [README.md](README.md) for general concepts

## Rollback

If you need to rollback to the XHR version:

```bash
npm install @pointcloudtechnology/resumablejs@^4.0.3
```

Note: The XHR version is still available in the TypeScript source files (`src/` directory) and can be built using webpack if needed.
