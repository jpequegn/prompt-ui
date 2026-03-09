type Props = {
  onFilesSelected?: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  className?: string;
};

export const FileUploadDropzone: React.FC<Props> = ({
  onFilesSelected,
  accept = "*",
  multiple = true,
  maxSize,
  className = "",
}) => {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    processFiles(droppedFiles);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    processFiles(selectedFiles);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const processFiles = (files: File[]) => {
    let validFiles = files;

    if (maxSize) {
      validFiles = files.filter((file) => file.size <= maxSize);
    }

    if (!multiple && validFiles.length > 1) {
      validFiles = [validFiles[0]];
    }

    if (onFilesSelected && validFiles.length > 0) {
      onFilesSelected(validFiles);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`flex items-center justify-center w-full ${className}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`
          flex flex-col items-center justify-center w-full max-w-lg p-8
          border-2 border-dashed rounded-xl transition-all duration-200 ease-in-out
          ${
            isDragOver
              ? "border-blue-500 bg-blue-50 scale-102"
              : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
          }
        `}
      >
        <div
          className={`
            flex items-center justify-center w-16 h-16 mb-4 rounded-full
            transition-colors duration-200
            ${isDragOver ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-500"}
          `}
        >
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        <div className="text-center mb-4">
          <p
            className={`
              text-lg font-medium transition-colors duration-200
              ${isDragOver ? "text-blue-600" : "text-gray-700"}
            `}
          >
            {isDragOver ? "Drop your files here" : "Drag and drop your files here"}
          </p>
          <p className="text-sm text-gray-500 mt-1">or</p>
        </div>

        <button
          type="button"
          onClick={handleBrowseClick}
          className="
            px-6 py-2.5 bg-blue-600 text-white font-medium text-sm rounded-lg
            hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            transition-colors duration-200 shadow-sm hover:shadow-md
          "
        >
          Browse Files
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileInputChange}
          className="hidden"
          aria-label="File upload input"
        />

        <p className="text-xs text-gray-400 mt-4">
          {multiple ? "Upload multiple files" : "Upload a single file"}
          {maxSize && ` (max ${Math.round(maxSize / 1024 / 1024)}MB each)`}
        </p>
      </div>
    </div>
  );
};

export default FileUploadDropzone;