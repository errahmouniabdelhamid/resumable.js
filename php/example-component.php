<?php

namespace App\Http\Livewire;

use Livewire\Component;
use Livewire\WithFileUploads;
use App\Services\ResumableLivewire;

/**
 * Example Livewire Component for Resumable File Uploads
 * 
 * This is a complete example showing how to integrate ResumableLivewire
 * with a Livewire component for handling chunked file uploads.
 */
class FileUploader extends Component
{
    use WithFileUploads;

    /**
     * The current chunk being uploaded
     * This property is bound to Livewire's upload functionality
     */
    public $upload;

    /**
     * Array of successfully uploaded files
     */
    public $uploadedFiles = [];

    /**
     * Upload progress percentage
     */
    public $uploadProgress = 0;

    /**
     * Current upload status message
     */
    public $statusMessage = 'Ready to upload';

    /**
     * The resumable handler instance
     */
    protected $resumableHandler;

    /**
     * Component validation rules
     */
    protected $rules = [
        'upload' => 'required|file|max:102400', // 100MB max
    ];

    /**
     * Initialize the component
     */
    public function mount()
    {
        // Initialize the ResumableLivewire handler
        $this->resumableHandler = new ResumableLivewire('public');
        
        // Enable debug logging in development
        $this->resumableHandler->setDebug(config('app.debug'));
        
        // Optionally customize folders
        // $this->resumableHandler->tempFolder = 'temp/chunks';
        // $this->resumableHandler->uploadFolder = 'uploads/' . auth()->id();
    }

    /**
     * Called when a chunk is uploaded
     * 
     * This is automatically triggered by Livewire when the 'upload' property changes
     */
    public function updatedUpload()
    {
        // Get chunk metadata from the request
        // These are sent by resumable.js along with the file
        $metadata = request()->only([
            'resumableChunkNumber',
            'resumableTotalChunks',
            'resumableIdentifier',
            'resumableFilename',
            'resumableChunkSize',
            'resumableTotalSize',
            'resumableCurrentChunkSize',
            'resumableType',
            'resumableRelativePath',
            'resumableFileCategory',
        ]);

        try {
            // Validate the uploaded file
            $this->validate();

            // Process the chunk
            $isComplete = $this->resumableHandler->handleChunk($this->upload, $metadata);

            // Update status
            $chunkNumber = (int) ($metadata['resumableChunkNumber'] ?? 0);
            $totalChunks = (int) ($metadata['resumableTotalChunks'] ?? 0);
            
            if ($totalChunks > 0) {
                $this->uploadProgress = round(($chunkNumber / $totalChunks) * 100);
                $this->statusMessage = "Uploading chunk {$chunkNumber} of {$totalChunks}";
            }

            // Check if upload is complete
            if ($isComplete) {
                $this->handleUploadComplete();
            }

            // Reset the upload property for the next chunk
            $this->upload = null;

        } catch (\Illuminate\Validation\ValidationException $e) {
            $this->statusMessage = 'Validation failed: ' . $e->getMessage();
            $this->dispatch('upload-error', ['message' => 'File validation failed']);
            
        } catch (\InvalidArgumentException $e) {
            $this->statusMessage = 'Invalid chunk metadata';
            $this->dispatch('upload-error', ['message' => 'Invalid chunk data']);
            
        } catch (\Exception $e) {
            $this->statusMessage = 'Upload failed: ' . $e->getMessage();
            $this->dispatch('upload-error', ['message' => $e->getMessage()]);
            
            // Log the error
            \Log::error('Resumable upload failed', [
                'error' => $e->getMessage(),
                'metadata' => $metadata,
            ]);
        }
    }

    /**
     * Handle successful upload completion
     */
    protected function handleUploadComplete()
    {
        $this->uploadProgress = 100;
        $this->statusMessage = 'Upload complete!';

        // Add the file to our list of uploaded files
        $this->uploadedFiles[] = [
            'original' => $this->resumableHandler->getOriginalFilename(),
            'filename' => $this->resumableHandler->getFilename(),
            'path' => $this->resumableHandler->getFilepath(),
            'uploaded_at' => now()->toDateTimeString(),
        ];

        // Dispatch event to JavaScript
        $this->dispatch('upload-complete', [
            'filename' => $this->resumableHandler->getFilename(),
            'path' => $this->resumableHandler->getFilepath(),
        ]);

        // You can also do additional processing here:
        // - Save file info to database
        // - Process the file (e.g., generate thumbnails for images)
        // - Send notifications
        // - etc.
        
        $this->saveToDatabase();
    }

    /**
     * Save file information to database
     */
    protected function saveToDatabase()
    {
        // Example: Save to a files table
        /*
        \App\Models\File::create([
            'user_id' => auth()->id(),
            'original_name' => $this->resumableHandler->getOriginalFilename(),
            'stored_name' => $this->resumableHandler->getFilename(),
            'path' => $this->resumableHandler->getFilepath(),
            'size' => Storage::size($this->resumableHandler->getFilepath()),
            'mime_type' => Storage::mimeType($this->resumableHandler->getFilepath()),
        ]);
        */
    }

    /**
     * Remove an uploaded file
     */
    public function removeFile($index)
    {
        if (isset($this->uploadedFiles[$index])) {
            $file = $this->uploadedFiles[$index];
            
            // Delete from storage
            if (\Storage::disk('public')->exists($file['path'])) {
                \Storage::disk('public')->delete($file['path']);
            }
            
            // Remove from list
            unset($this->uploadedFiles[$index]);
            $this->uploadedFiles = array_values($this->uploadedFiles); // Re-index
            
            $this->statusMessage = 'File removed';
        }
    }

    /**
     * Clear all uploaded files
     */
    public function clearAll()
    {
        foreach ($this->uploadedFiles as $file) {
            if (\Storage::disk('public')->exists($file['path'])) {
                \Storage::disk('public')->delete($file['path']);
            }
        }
        
        $this->uploadedFiles = [];
        $this->uploadProgress = 0;
        $this->statusMessage = 'All files cleared';
    }

    /**
     * Render the component
     */
    public function render()
    {
        return view('livewire.file-uploader');
    }
}
