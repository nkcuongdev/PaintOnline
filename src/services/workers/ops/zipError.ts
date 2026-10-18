/** Lỗi giải nén ZIP (tách riêng để main thread dùng mà không kéo theo fflate). */
export type ZipErrorCode = 'notZip' | 'tooManyEntries' | 'tooLarge' | 'badPath' | 'corrupt';

export class ZipError extends Error {
  constructor(readonly code: ZipErrorCode) {
    super(`File ZIP không hợp lệ: ${code}`);
    this.name = 'ZipError';
  }
}
