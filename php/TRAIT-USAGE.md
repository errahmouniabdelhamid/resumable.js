# HandlesResumableUploads Trait - Simple Native Livewire Approach

A simple, trait-based approach for handling resumable file uploads in Livewire v3 using native upload callbacks.

## Why Use This Trait?

This trait provides the **simplest possible integration** for resumable uploads:

✅ **Native Livewire** - Uses `$wire.upload()` callbacks directly  
✅ **No Manual Handling** - Chunks are assembled automatically  
✅ **Minimal Code** - Just add the trait and define hooks  
✅ **Event-Driven** - Uses Livewire's native event system  
✅ **Flexible** - Easy to customize and extend  

## Quick Start

### 1. Add the Trait to Your Component

```php
<?php

namespace App\Http\Livewire;

use Livewire\Component;
use Livewire\WithFileUploads;
use App\Traits\HandlesResumableUploads;

class FileUploader extends Component
{
    use WithFileUploads, HandlesResumableUploads;

    public $upload;  // Required: Property for file upload
    public $uploadedFiles = [];

    // Hook: Called when upload completes
    protected function onUploadComplete(string $filepath, string $originalFilename): void
    {
        $this->uploadedFiles[] = [
            'original' => $originalFilename,
            'path' => $filepath,
        ];
    }

    public function render()
    {
        return view('livewire.file-uploader');
    }
}
```

### 2. Add JavaScript to Your Blade View

```blade
<div>
    <div id="upload-zone" wire:ignore>
        <button id="browse-button">Select Files</button>
    </div>

    @if(count($uploadedFiles) > 0)
        <ul>
            @foreach($uploadedFiles as $file)
                <li>{{ $file['original'] }}</li>
            @endforeach
        </ul>
    @endif

    @push('scripts')
    <script type="module">
        import Resumable from '/dist/resumable-livewire.es.js';

        const resumable = new Resumable({
            livewireComponent: @this,
            livewireProperty: 'upload',
            chunkSize: 1024 * 1024, // 1MB chunks
        });

        resumable.assignBrowse(document.getElementById('browse-button'));
        resumable.assignDrop(document.getElementById('upload-zone'));

        resumable.on('fileAdded', () => resumable.upload());
    </script>
    @endpush
</div>
```

That's it! The trait handles everything else automatically.

## How It Works

### Automatic Chunk Processing

The trait automatically:

1. **Receives chunks** via the `updatedUpload()` lifecycle hook
2. **Stores chunks** temporarily in the configured storage disk
3. **Checks completion** after each chunk is uploaded
4. **Assembles chunks** into the final file when all chunks are received
5. **Cleans up** temporary chunk files
6. **Calls your hooks** to notify you of completion or errors

### Flow Diagram

```
JavaScript (Resumable.js)          Livewire Component (Trait)
         |                                    |
    File Selected                             |
         |                                    |
    Split into Chunks                         |
         |                                    |
    Upload Chunk 1 -----> updatedUpload() ----|
         |                      |              |
    Upload Chunk 2              |         saveChunk()
         |                      |              |
    Upload Chunk 3              |         isComplete? No
         |                      |              |
         ...                    |              |
         |                      |              |
    Upload Last Chunk           |         isComplete? Yes
         |                      |              |
         |                      |         assembleChunks()
         |                      |              |
         |                      |         cleanupChunks()
         |                      |              |
         |                      |-----> onUploadComplete()
         |                                    |
    Success Callback <------ dispatch('upload:complete')
```

## Configuration

### Storage Settings

You can customize storage locations in your component:

```php
protected string $resumableDisk = 'local';  // Storage disk
protected string $resumableTempFolder = 'resumable-chunks';  // Temp folder
protected string $resumableUploadFolder = 'uploads';  // Final folder
```

Or override in `mount()`:

```php
public function mount()
{
    $this->resumableDisk = 'public';
    $this->resumableUploadFolder = 'user-uploads/' . auth()->id();
}
```

### Available Hooks

#### `onUploadComplete(string $filepath, string $originalFilename): void`

Called when all chunks are successfully assembled.

```php
protected function onUploadComplete(string $filepath, string $originalFilename): void
{
    // Save to database
    Auth::user()->files()->create([
        'name' => $originalFilename,
        'path' => $filepath,
        'size' => Storage::size($filepath),
    ]);

    // Generate thumbnail for images
    if (Str::contains($filepath, ['.jpg', '.png'])) {
        $this->generateThumbnail($filepath);
    }

    // Send notification
    $this->dispatch('notification', [
        'message' => "File uploaded: {$originalFilename}"
    ]);
}
```

#### `onUploadError(\Exception $e): void` (Optional)

Called when an error occurs during chunk processing.

```php
protected function onUploadError(\Exception $e): void
{
    Log::error('Upload failed', [
        'user' => auth()->id(),
        'error' => $e->getMessage(),
    ]);

    $this->dispatch('notification', [
        'type' => 'error',
        'message' => 'Upload failed: ' . $e->getMessage(),
    ]);
}
```

## JavaScript Events

The trait dispatches Livewire events that you can listen to:

```javascript
// Listen for upload completion
window.addEventListener('upload:complete', (event) => {
    console.log('File uploaded:', event.detail.filename);
    console.log('Path:', event.detail.path);
});

// Listen for upload errors
window.addEventListener('upload:error', (event) => {
    console.error('Error:', event.detail.message);
    alert('Upload failed: ' + event.detail.message);
});
```

## Complete Examples

### Example 1: Basic Upload

```php
class BasicUploader extends Component
{
    use WithFileUploads, HandlesResumableUploads;

    public $upload;

    protected function onUploadComplete(string $filepath, string $originalFilename): void
    {
        // Just log it
        Log::info("File uploaded: {$filepath}");
    }

    public function render()
    {
        return view('livewire.basic-uploader');
    }
}
```

### Example 2: User-Specific Storage

```php
class UserFileUploader extends Component
{
    use WithFileUploads, HandlesResumableUploads;

    public $upload;
    public $userFiles = [];

    public function mount()
    {
        // Store files in user-specific folder
        $this->resumableUploadFolder = 'users/' . auth()->id();
        
        // Load existing files
        $this->userFiles = Auth::user()->files()->latest()->get();
    }

    protected function onUploadComplete(string $filepath, string $originalFilename): void
    {
        // Save to database with user association
        $file = Auth::user()->files()->create([
            'original_name' => $originalFilename,
            'stored_path' => $filepath,
            'size' => Storage::size($filepath),
            'mime_type' => Storage::mimeType($filepath),
        ]);

        // Reload files
        $this->userFiles = Auth::user()->files()->latest()->get();

        // Notify user
        $this->dispatch('file-uploaded', ['id' => $file->id]);
    }

    public function render()
    {
        return view('livewire.user-file-uploader');
    }
}
```

### Example 3: Image Processing

```php
class ImageUploader extends Component
{
    use WithFileUploads, HandlesResumableUploads;

    public $upload;
    public $images = [];

    protected function onUploadComplete(string $filepath, string $originalFilename): void
    {
        // Verify it's an image
        $mimeType = Storage::mimeType($filepath);
        if (!Str::startsWith($mimeType, 'image/')) {
            Storage::delete($filepath);
            throw new \Exception('Only images are allowed');
        }

        // Generate thumbnails
        $thumbnailPath = $this->generateThumbnail($filepath);

        // Save to database
        $this->images[] = [
            'original' => $filepath,
            'thumbnail' => $thumbnailPath,
            'uploaded_at' => now(),
        ];
    }

    private function generateThumbnail(string $filepath): string
    {
        // Use Intervention Image or similar
        $image = Image::make(Storage::path($filepath));
        $image->resize(300, 300, function ($constraint) {
            $constraint->aspectRatio();
        });

        $thumbnailPath = 'thumbnails/' . basename($filepath);
        Storage::put($thumbnailPath, (string) $image->encode());

        return $thumbnailPath;
    }

    public function render()
    {
        return view('livewire.image-uploader');
    }
}
```

## Trait Methods

The trait provides these protected methods you can use:

| Method | Description |
|--------|-------------|
| `getChunkMetadata()` | Get chunk metadata from the request |
| `isValidChunkMetadata($metadata)` | Validate chunk metadata |
| `saveChunk($file, $metadata)` | Save a chunk to storage |
| `isUploadComplete($metadata)` | Check if all chunks uploaded |
| `chunkExists($identifier, $filename, $chunkNumber)` | Check if a chunk exists |
| `assembleChunks($metadata)` | Assemble chunks into final file |
| `cleanupChunks($identifier, $filename, $totalChunks)` | Delete chunk files |
| `sanitizeFilename($filename)` | Create safe filename |

## Comparison with Full Handler

| Feature | Trait Approach | Full Handler |
|---------|---------------|--------------|
| Complexity | Very Simple | More Complex |
| Code Lines | ~20 lines | ~50+ lines |
| Flexibility | Basic | Advanced |
| Learning Curve | Easy | Moderate |
| Best For | Most use cases | Advanced scenarios |

Use the **Trait** when you want:
- Simple, straightforward uploads
- Automatic chunk handling
- Minimal boilerplate code

Use the **Full Handler** when you need:
- Custom chunk validation logic
- Complex storage strategies
- Fine-grained control over assembly
- Support for non-Laravel filesystems

## Troubleshooting

### Chunks Not Assembling

**Check 1**: Verify Livewire property name matches JavaScript
```php
public $upload;  // In PHP

// In JavaScript
livewireProperty: 'upload',  // Must match
```

**Check 2**: Ensure trait is imported
```php
use App\Traits\HandlesResumableUploads;
```

**Check 3**: Check storage permissions
```bash
chmod -R 775 storage/app
```

### Slow Uploads

**Solution**: Increase chunk size
```javascript
const resumable = new Resumable({
    chunkSize: 5 * 1024 * 1024, // 5MB chunks instead of 1MB
    simultaneousUploads: 5, // More concurrent uploads
});
```

### Memory Issues

For very large files, override `assembleChunks()` to use streaming:

```php
protected function assembleChunks(array $metadata): ?string
{
    // Use streaming instead of loading all into memory
    $identifier = $metadata['resumableIdentifier'];
    $filename = $metadata['resumableFilename'];
    $totalChunks = (int) $metadata['resumableTotalChunks'];
    
    $safeFilename = $this->sanitizeFilename($filename);
    $finalPath = $this->resumableUploadFolder . '/' . $safeFilename;
    
    $stream = Storage::disk($this->resumableDisk)->writeStream($finalPath);
    
    for ($i = 1; $i <= $totalChunks; $i++) {
        $chunkPath = $this->buildChunkPath($identifier, $filename, $i);
        $chunkStream = Storage::disk($this->resumableDisk)->readStream($chunkPath);
        stream_copy_to_stream($chunkStream, $stream);
        fclose($chunkStream);
    }
    
    fclose($stream);
    $this->cleanupChunks($identifier, $filename, $totalChunks);
    
    return $finalPath;
}
```

## Requirements

- PHP 8.0+
- Laravel 9.x / 10.x / 11.x
- Livewire 3.x

## See Also

- [ResumableLivewire Full Handler](README.md) - For advanced use cases
- [Simple Example Component](simple-example-component.php)
- [Simple Example View](simple-example-component.blade.php)
- [JavaScript Documentation](../README-LIVEWIRE.md)
