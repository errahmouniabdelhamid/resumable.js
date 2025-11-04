# ResumableLivewire PHP Backend Handler

A Laravel/Livewire backend handler for processing chunked file uploads from the Livewire edition of resumable.js.

## Features

- ✅ Handles chunk uploads via Livewire's native file upload
- ✅ Assembles chunks into final files
- ✅ Automatic cleanup of temporary chunks
- ✅ Configurable storage disks
- ✅ Safe filename handling
- ✅ Debug logging support
- ✅ Laravel Storage facade integration

## Installation

1. Copy `ResumableLivewire.php` to your Laravel project (e.g., `app/Services/`)

2. Update the namespace in the file to match your project structure:
```php
namespace App\Services;
```

## Basic Usage

### In Your Livewire Component

```php
<?php

namespace App\Http\Livewire;

use Livewire\Component;
use Livewire\WithFileUploads;
use App\Services\ResumableLivewire;

class FileUploader extends Component
{
    use WithFileUploads;

    public $upload;
    public $uploadProgress = 0;
    public $uploadedFiles = [];

    protected $resumableHandler;

    public function mount()
    {
        // Initialize the handler
        $this->resumableHandler = new ResumableLivewire('public');
        $this->resumableHandler->setDebug(config('app.debug'));
    }

    public function updatedUpload()
    {
        // Get chunk metadata from the request
        $metadata = request()->only([
            'resumableChunkNumber',
            'resumableTotalChunks',
            'resumableIdentifier',
            'resumableFilename',
            'resumableChunkSize',
            'resumableTotalSize',
            'resumableType',
            'resumableRelativePath',
        ]);

        try {
            // Process the chunk
            $isComplete = $this->resumableHandler->handleChunk($this->upload, $metadata);

            if ($isComplete) {
                // Upload is complete!
                $this->uploadedFiles[] = [
                    'original' => $this->resumableHandler->getOriginalFilename(),
                    'filename' => $this->resumableHandler->getFilename(),
                    'path' => $this->resumableHandler->getFilepath(),
                ];

                // Emit success event
                $this->dispatch('upload-complete', [
                    'filename' => $this->resumableHandler->getFilename(),
                    'path' => $this->resumableHandler->getFilepath(),
                ]);

                // Reset for next upload
                $this->upload = null;
            }
        } catch (\Exception $e) {
            // Handle error
            $this->dispatch('upload-error', ['message' => $e->getMessage()]);
        }
    }

    public function render()
    {
        return view('livewire.file-uploader');
    }
}
```

### In Your Blade Template

```blade
<div>
    <div id="upload-zone" wire:ignore>
        <button id="browse-button">Select Files</button>
        <div id="file-list"></div>
    </div>

    @if (count($uploadedFiles) > 0)
        <div class="uploaded-files">
            <h3>Uploaded Files:</h3>
            <ul>
                @foreach ($uploadedFiles as $file)
                    <li>{{ $file['filename'] }} ({{ $file['original'] }})</li>
                @endforeach
            </ul>
        </div>
    @endif

    <script type="module">
        import Resumable from '/dist/resumable-livewire.es.js';

        const component = @this;

        const resumable = new Resumable({
            livewireComponent: component,
            livewireProperty: 'upload',
            chunkSize: 1024 * 1024, // 1MB chunks
            simultaneousUploads: 3,
            testChunks: false,
            maxFileSize: 100 * 1024 * 1024, // 100MB
        });

        resumable.assignBrowse(document.getElementById('browse-button'));
        resumable.assignDrop(document.getElementById('upload-zone'));

        resumable.on('fileAdded', (file) => {
            resumable.upload();
        });

        resumable.on('fileSuccess', (file) => {
            console.log('File uploaded:', file.fileName);
        });

        // Listen for completion event from Livewire
        window.addEventListener('upload-complete', (event) => {
            console.log('Upload complete:', event.detail);
        });
    </script>
</div>
```

## Advanced Usage

### Custom Filename

```php
public function updatedUpload()
{
    $metadata = request()->only([...]);
    
    // Set custom filename before handling
    $this->resumableHandler->setFilename('custom-name-' . time() . '.pdf');
    
    $isComplete = $this->resumableHandler->handleChunk($this->upload, $metadata);
    // ...
}
```

### Different Storage Disk

```php
public function mount()
{
    // Use S3 or any other configured disk
    $this->resumableHandler = new ResumableLivewire('s3');
}
```

### Custom Folders

```php
public function mount()
{
    $this->resumableHandler = new ResumableLivewire();
    $this->resumableHandler->tempFolder = 'temp/chunks';
    $this->resumableHandler->uploadFolder = 'user-uploads/' . auth()->id();
}
```

## Configuration Options

### ResumableLivewire Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `tempFolder` | string | `'resumable-chunks'` | Temporary folder for chunks |
| `uploadFolder` | string | `'uploads'` | Final upload folder |
| `disk` | string | `'local'` | Laravel storage disk to use |
| `debug` | bool | `false` | Enable debug logging |

### Methods

| Method | Description |
|--------|-------------|
| `handleChunk(UploadedFile $file, array $metadata)` | Process a chunk upload |
| `isChunkUploaded(string $identifier, string $filename, int $chunkNumber)` | Check if chunk exists |
| `isFileUploadComplete(string $filename, string $identifier, int $totalChunks)` | Check if all chunks received |
| `setFilename(string $filename)` | Override final filename |
| `getFilename()` | Get final filename |
| `getOriginalFilename()` | Get original filename |
| `getFilepath()` | Get final file path |
| `setDisk(string $disk)` | Set storage disk |
| `setDebug(bool $debug)` | Enable/disable debug logging |

## How It Works

1. **Chunk Upload**: When a chunk is uploaded via Livewire, it's saved to the temporary folder with the pattern: `{tempFolder}/{identifier}/{filename}.{chunkNumber}`

2. **Completion Check**: After each chunk, the handler checks if all chunks have been received

3. **Assembly**: When complete, all chunks are concatenated in order to create the final file

4. **Cleanup**: After successful assembly, all chunk files and the temporary directory are deleted

## File Structure

```
storage/app/
├── resumable-chunks/           # Temporary chunks
│   └── {identifier}/
│       ├── filename.0001
│       ├── filename.0002
│       └── ...
└── uploads/                    # Final files
    └── filename.ext
```

## Error Handling

```php
public function updatedUpload()
{
    $metadata = request()->only([...]);

    try {
        $isComplete = $this->resumableHandler->handleChunk($this->upload, $metadata);
        
        if ($isComplete) {
            // Success!
        }
    } catch (\InvalidArgumentException $e) {
        // Invalid metadata
        $this->addError('upload', 'Invalid chunk metadata: ' . $e->getMessage());
    } catch (\Exception $e) {
        // Other errors
        $this->addError('upload', 'Upload failed: ' . $e->getMessage());
    }
}
```

## Troubleshooting

### Chunks Not Assembling

**Check 1**: Verify all chunks are received
```php
$totalChunks = (int) request('resumableTotalChunks');
for ($i = 1; $i <= $totalChunks; $i++) {
    if (!$handler->isChunkUploaded($identifier, $filename, $i)) {
        \Log::info("Missing chunk: {$i}");
    }
}
```

**Check 2**: Verify storage disk permissions
```bash
php artisan storage:link
chmod -R 775 storage/app
```

### Memory Issues with Large Files

For very large files, consider using streaming instead of concatenation:

```php
// In ResumableLivewire.php, modify createFileFromChunks()
protected function createFileFromChunks(...): bool
{
    $stream = Storage::disk($this->disk)->writeStream($destPath);
    
    for ($i = 1; $i <= $totalChunks; $i++) {
        $chunkPath = $this->getChunkPath($identifier, $filename, $i);
        $chunkStream = Storage::disk($this->disk)->readStream($chunkPath);
        
        while (!feof($chunkStream)) {
            fwrite($stream, fread($chunkStream, 8192));
        }
        
        fclose($chunkStream);
    }
    
    fclose($stream);
    
    return true;
}
```

## Differences from Original Handler

| Feature | Original (PSR-7) | New (Livewire) |
|---------|-----------------|----------------|
| Request/Response | PSR-7 interfaces | Laravel/Livewire |
| Storage | Gaufrette filesystem | Laravel Storage |
| Test chunks | GET endpoint | Method call |
| Upload handling | POST endpoint | Livewire property update |
| File sanitization | FilenameSanitize package | Built-in regex |

## Requirements

- PHP 8.0+
- Laravel 9.x or 10.x
- Livewire 3.x

## License

MIT License - Same as resumable.js

## See Also

- [ResumableLivewire JavaScript Documentation](../README-LIVEWIRE.md)
- [Migration Guide](../MIGRATION.md)
- [Livewire File Uploads Documentation](https://livewire.laravel.com/docs/uploads)
