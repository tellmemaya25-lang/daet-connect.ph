import {
  validateImageFile,
  isValidImageMimeType,
  formatFileSize,
  MAX_IMAGE_FILE_SIZE,
  ALLOWED_IMAGE_MIME_TYPES,
} from '@/lib/tours/validation';

describe('Image Validation Utilities', () => {
  describe('isValidImageMimeType', () => {
    describe('valid MIME types', () => {
      it('accepts image/jpeg', () => {
        expect(isValidImageMimeType('image/jpeg')).toBe(true);
      });

      it('accepts image/png', () => {
        expect(isValidImageMimeType('image/png')).toBe(true);
      });

      it('accepts image/webp', () => {
        expect(isValidImageMimeType('image/webp')).toBe(true);
      });

      it('is case-insensitive', () => {
        expect(isValidImageMimeType('IMAGE/JPEG')).toBe(true);
        expect(isValidImageMimeType('Image/Png')).toBe(true);
        expect(isValidImageMimeType('IMAGE/WEBP')).toBe(true);
      });

      it('trims whitespace', () => {
        expect(isValidImageMimeType('  image/jpeg  ')).toBe(true);
        expect(isValidImageMimeType('\nimage/png\n')).toBe(true);
      });
    });

    describe('invalid MIME types', () => {
      it('rejects image/gif', () => {
        expect(isValidImageMimeType('image/gif')).toBe(false);
      });

      it('rejects image/bmp', () => {
        expect(isValidImageMimeType('image/bmp')).toBe(false);
      });

      it('rejects application/pdf', () => {
        expect(isValidImageMimeType('application/pdf')).toBe(false);
      });

      it('rejects text/plain', () => {
        expect(isValidImageMimeType('text/plain')).toBe(false);
      });

      it('rejects video/mp4', () => {
        expect(isValidImageMimeType('video/mp4')).toBe(false);
      });

      it('rejects arbitrary string', () => {
        expect(isValidImageMimeType('not-a-mime-type')).toBe(false);
      });

      it('rejects empty string', () => {
        expect(isValidImageMimeType('')).toBe(false);
      });

      it('rejects null', () => {
        expect(isValidImageMimeType(null)).toBe(false);
      });

      it('rejects undefined', () => {
        expect(isValidImageMimeType(undefined)).toBe(false);
      });

      it('rejects non-string values', () => {
        expect(isValidImageMimeType(123 as any)).toBe(false);
        expect(isValidImageMimeType({} as any)).toBe(false);
        expect(isValidImageMimeType([] as any)).toBe(false);
      });
    });
  });

  describe('formatFileSize', () => {
    describe('bytes', () => {
      it('formats 0 bytes', () => {
        expect(formatFileSize(0)).toBe('0 B');
      });

      it('formats 1 byte', () => {
        expect(formatFileSize(1)).toBe('1 B');
      });

      it('formats 512 bytes', () => {
        expect(formatFileSize(512)).toBe('512 B');
      });

      it('formats 1023 bytes', () => {
        expect(formatFileSize(1023)).toBe('1023 B');
      });
    });

    describe('kilobytes', () => {
      it('formats exactly 1 KB', () => {
        expect(formatFileSize(1024)).toBe('1 KB');
      });

      it('formats 1.5 KB', () => {
        expect(formatFileSize(1536)).toBe('1.5 KB');
      });

      it('formats 512 KB', () => {
        expect(formatFileSize(512 * 1024)).toBe('512 KB');
      });

      it('formats 1023.5 KB', () => {
        expect(formatFileSize(1048576 - 512)).toBe('1023.5 KB');
      });
    });

    describe('megabytes', () => {
      it('formats exactly 1 MB', () => {
        expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      });

      it('formats 2.5 MB', () => {
        expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
      });

      it('formats 5 MB (max file size)', () => {
        expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
      });

      it('formats 100 MB', () => {
        expect(formatFileSize(100 * 1024 * 1024)).toBe('100 MB');
      });

      it('formats 1023.5 MB', () => {
        const bytes = 1023.5 * 1024 * 1024;
        expect(formatFileSize(bytes)).toBe('1023.5 MB');
      });
    });

    describe('gigabytes', () => {
      it('formats exactly 1 GB', () => {
        expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
      });

      it('formats 2.5 GB', () => {
        expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
      });

      it('formats 10 GB', () => {
        expect(formatFileSize(10 * 1024 * 1024 * 1024)).toBe('10 GB');
      });
    });

    describe('terabytes', () => {
      it('formats exactly 1 TB', () => {
        expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
      });

      it('formats 5.5 TB', () => {
        expect(formatFileSize(5.5 * 1024 * 1024 * 1024 * 1024)).toBe('5.5 TB');
      });
    });

    describe('edge cases and invalid inputs', () => {
      it('handles negative numbers by returning 0 B', () => {
        expect(formatFileSize(-100)).toBe('0 B');
      });

      it('handles Infinity by returning 0 B', () => {
        expect(formatFileSize(Infinity)).toBe('0 B');
      });

      it('handles NaN by returning 0 B', () => {
        expect(formatFileSize(NaN)).toBe('0 B');
      });

      it('rounds to 2 decimal places', () => {
        // 1.234567 KB should round to 1.23 KB
        expect(formatFileSize(1263.1)).toBe('1.23 KB');
      });

      it('handles very large numbers', () => {
        const veryLarge = 999 * 1024 * 1024 * 1024 * 1024;
        const result = formatFileSize(veryLarge);
        expect(result).toContain('TB');
      });
    });
  });

  describe('validateImageFile', () => {
    describe('valid files', () => {
      it('accepts a valid JPEG file', () => {
        const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(true);
      });

      it('accepts a valid PNG file', () => {
        const file = new File(['content'], 'test.png', { type: 'image/png' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(true);
      });

      it('accepts a valid WebP file', () => {
        const file = new File(['content'], 'test.webp', { type: 'image/webp' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(true);
      });

      it('accepts files up to exactly 5MB', () => {
        const content = new Uint8Array(MAX_IMAGE_FILE_SIZE);
        const file = new File([content], 'large.jpg', { type: 'image/jpeg' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(true);
      });

      it('accepts small files', () => {
        const file = new File(['x'], 'tiny.jpg', { type: 'image/jpeg' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(true);
      });
    });

    describe('invalid files - missing or empty', () => {
      it('rejects null file', () => {
        const result = validateImageFile(null);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('Please select a file');
        }
      });

      it('rejects undefined file', () => {
        const result = validateImageFile(undefined);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('Please select a file');
        }
      });

      it('rejects empty file', () => {
        const file = new File([], 'empty.jpg', { type: 'image/jpeg' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('File is empty');
        }
      });
    });

    describe('invalid files - size constraints', () => {
      it('rejects files larger than 5MB', () => {
        const oversizedContent = new Uint8Array(MAX_IMAGE_FILE_SIZE + 1);
        const file = new File([oversizedContent], 'large.jpg', { type: 'image/jpeg' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('File is too large');
          expect(result.error).toContain('5 MB');
        }
      });

      it('rejects files at 10MB', () => {
        const content = new Uint8Array(10 * 1024 * 1024);
        const file = new File([content], 'large.jpg', { type: 'image/jpeg' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('File is too large');
        }
      });

      it('includes file size in error message', () => {
        const content = new Uint8Array(10 * 1024 * 1024);
        const file = new File([content], 'large.jpg', { type: 'image/jpeg' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('10 MB');
        }
      });
    });

    describe('invalid files - format/MIME type', () => {
      it('rejects GIF files', () => {
        const file = new File(['content'], 'test.gif', { type: 'image/gif' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('File format not supported');
        }
      });

      it('rejects PDF files', () => {
        const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('File format not supported');
        }
      });

      it('rejects video files', () => {
        const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('File format not supported');
        }
      });

      it('rejects text files', () => {
        const file = new File(['content'], 'test.txt', { type: 'text/plain' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('File format not supported');
        }
      });

      it('rejects files with no MIME type', () => {
        const file = new File(['content'], 'test.jpg', { type: '' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('File format not supported');
        }
      });

      it('includes MIME type in error for debugging', () => {
        const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toContain('application/pdf');
        }
      });
    });

    describe('error messages are user-friendly', () => {
      it('provides clear guidance for empty files', () => {
        const file = new File([], 'empty.jpg', { type: 'image/jpeg' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toMatch(/non-empty/i);
        }
      });

      it('provides clear guidance for oversized files', () => {
        const content = new Uint8Array(10 * 1024 * 1024);
        const file = new File([content], 'large.jpg', { type: 'image/jpeg' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toMatch(/maximum|size/i);
        }
      });

      it('provides clear guidance for unsupported formats', () => {
        const file = new File(['content'], 'test.gif', { type: 'image/gif' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toMatch(/JPG.*PNG.*WebP|use/i);
        }
      });
    });

    describe('case insensitivity for MIME types', () => {
      it('accepts uppercase MIME type', () => {
        const file = new File(['content'], 'test.jpg', { type: 'IMAGE/JPEG' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(true);
      });

      it('accepts mixed case MIME type', () => {
        const file = new File(['content'], 'test.png', { type: 'Image/Png' });
        const result = validateImageFile(file);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('constants', () => {
    it('MAX_IMAGE_FILE_SIZE is 5MB', () => {
      expect(MAX_IMAGE_FILE_SIZE).toBe(5 * 1024 * 1024);
    });

    it('ALLOWED_IMAGE_MIME_TYPES includes jpeg, png, webp', () => {
      expect(ALLOWED_IMAGE_MIME_TYPES).toContain('image/jpeg');
      expect(ALLOWED_IMAGE_MIME_TYPES).toContain('image/png');
      expect(ALLOWED_IMAGE_MIME_TYPES).toContain('image/webp');
      expect(ALLOWED_IMAGE_MIME_TYPES.length).toBe(3);
    });
  });
});
