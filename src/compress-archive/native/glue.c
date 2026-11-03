/*
 * The calls Compress Archive makes to libarchive (engine/archive-engine.js): archives read from
 * and written to memory, never to files. Built by build.sh into engine/libarchive.js.
 *
 * Reading:  la_read_open(bytes, length, raw, passphrase) → reader; la_read_next() moves to the next
 *           entry (ARCHIVE_OK, ARCHIVE_EOF or an error), la_entry_*() describe it, la_read_data()
 *           reads its content a piece at a time. raw: the content of a compressed file that is not
 *           an archive (note.txt.gz), as a single entry.
 * Writing:  la_write_open(format, filter, options, passphrase) → writer; la_write_entry() for each
 *           folder and file, la_write_close(), then la_write_bytes()/la_write_size() hold the result.
 * Every handle is freed with la_read_free() / la_write_free(); errors are read with *_error().
 */
#include <archive.h>
#include <archive_entry.h>
#include <emscripten.h>
#include <errno.h>
#include <locale.h>
#include <stdlib.h>
#include <string.h>

#define API EMSCRIPTEN_KEEPALIVE

/* Names in archives are UTF-8 on our side */
API void la_init(void) { setlocale(LC_ALL, "C.UTF-8"); }

API const char *la_version(void) { return archive_version_details(); }

/* ---------- Reading ---------- */

typedef struct {
  struct archive *a;
  struct archive_entry *e;
  int status;
} reader;

API reader *la_read_open(const void *data, size_t length, int raw, const char *passphrase) {
  reader *r = calloc(1, sizeof *r);
  if (!r) return NULL;
  r->a = archive_read_new();
  if (!r->a) { free(r); return NULL; }
  archive_read_support_filter_gzip(r->a);
  archive_read_support_filter_bzip2(r->a);
  archive_read_support_filter_xz(r->a);
  archive_read_support_filter_lzma(r->a);
  if (raw) {
    archive_read_support_format_raw(r->a);
  } else {
    archive_read_support_format_zip(r->a);
    archive_read_support_format_tar(r->a);
    archive_read_support_format_rar(r->a);
    archive_read_support_format_rar5(r->a);
    archive_read_support_format_iso9660(r->a);
    archive_read_support_format_7zip(r->a);
    archive_read_support_format_empty(r->a);
  }
  if (passphrase && *passphrase) archive_read_add_passphrase(r->a, passphrase);
  r->status = archive_read_open_memory(r->a, data, length);
  return r;
}

API int la_read_status(reader *r) { return r->status; }
API int la_read_next(reader *r) { return r->status = archive_read_next_header(r->a, &r->e); }
API la_ssize_t la_read_data(reader *r, void *buffer, size_t length) { return archive_read_data(r->a, buffer, length); }
API int la_read_skip(reader *r) { return archive_read_data_skip(r->a); }
API const char *la_read_error(reader *r) { return archive_error_string(r->a); }
API int la_read_errno(reader *r) { return archive_errno(r->a); }
API int la_read_format(reader *r) { return archive_format(r->a); }
API const char *la_read_format_name(reader *r) { return archive_format_name(r->a); }
/* The filters, outermost first: n = 0 … la_read_filters() - 1 (the last one is always "none") */
API int la_read_filters(reader *r) { return archive_filter_count(r->a); }
API int la_read_filter(reader *r, int n) { return archive_filter_code(r->a, n); }
API int la_read_encrypted(reader *r) { return archive_read_has_encrypted_entries(r->a); }

API void la_read_free(reader *r) {
  if (!r) return;
  archive_read_free(r->a);
  free(r);
}

API const char *la_entry_path(reader *r) {
  const char *p = archive_entry_pathname_utf8(r->e);
  return p ? p : archive_entry_pathname(r->e);
}
API int la_entry_type(reader *r) { return (int)archive_entry_filetype(r->e); }
API double la_entry_size(reader *r) { return archive_entry_size_is_set(r->e) ? (double)archive_entry_size(r->e) : -1; }
API double la_entry_mtime(reader *r) {
  return archive_entry_mtime_is_set(r->e) ? (double)archive_entry_mtime(r->e) * 1000.0 + archive_entry_mtime_nsec(r->e) / 1e6 : -1;
}
API int la_entry_encrypted(reader *r) { return archive_entry_is_encrypted(r->e); }
API int la_entry_link(reader *r) { return archive_entry_hardlink(r->e) != NULL || archive_entry_symlink(r->e) != NULL; }

/* ---------- Writing ---------- */

typedef struct {
  struct archive *a;
  unsigned char *bytes;
  size_t size, room;
  int status;
} writer;

static la_ssize_t take(struct archive *a, void *user, const void *data, size_t length) {
  writer *w = user;
  if (w->size + length > w->room) {
    size_t room = w->room ? w->room : 1 << 16;
    while (room < w->size + length) room *= 2;
    unsigned char *more = realloc(w->bytes, room);
    if (!more) {
      archive_set_error(a, ENOMEM, "Out of memory");
      return -1;
    }
    w->bytes = more;
    w->room = room;
  }
  memcpy(w->bytes + w->size, data, length);
  w->size += length;
  return (la_ssize_t)length;
}

/* format: 'zip', '7zip', 'paxr', 'iso9660', 'raw'; filter: 'none', 'gzip', 'bzip2', 'xz';
   options: libarchive's 'module:option=value,…' */
API writer *la_write_open(const char *format, const char *filter, const char *options, const char *passphrase) {
  writer *w = calloc(1, sizeof *w);
  if (!w) return NULL;
  w->a = archive_write_new();
  if (!w->a) { free(w); return NULL; }
  if ((w->status = archive_write_set_format_by_name(w->a, format)) != ARCHIVE_OK) return w;
  if (strcmp(filter, "none") != 0 && (w->status = archive_write_add_filter_by_name(w->a, filter)) != ARCHIVE_OK) return w;
  if (options && *options && (w->status = archive_write_set_options(w->a, options)) != ARCHIVE_OK) return w;
  if (passphrase && *passphrase && (w->status = archive_write_set_passphrase(w->a, passphrase)) != ARCHIVE_OK) return w;
  /* No zeros up to a 10 KB block at the end (tape blocks): a small archive stays small, and
     readers of a compressed stream do not stumble on them (Python's lzma does) */
  archive_write_set_bytes_in_last_block(w->a, 1);
  w->status = archive_write_open2(w->a, w, NULL, take, NULL, NULL);
  return w;
}

API int la_write_status(writer *w) { return w->status; }

/* Zip: the next files stored as they are (already compressed) or deflated */
API void la_write_zip_store(writer *w, int store) {
  if (store) archive_write_zip_set_compression_store(w->a);
  else archive_write_zip_set_compression_deflate(w->a);
}

/* folder: no data; mtime in ms (< 0: none) */
API int la_write_entry(writer *w, const char *path, int folder, double mtime, const void *data, size_t length) {
  struct archive_entry *e = archive_entry_new();
  if (!e) return ARCHIVE_FATAL;
  archive_entry_set_pathname_utf8(e, path);
  archive_entry_set_filetype(e, folder ? AE_IFDIR : AE_IFREG);
  archive_entry_set_perm(e, folder ? 0755 : 0644);
  archive_entry_set_size(e, folder ? 0 : (la_int64_t)length);
  if (mtime >= 0) {
    double s = mtime / 1000.0;
    archive_entry_set_mtime(e, (time_t)s, (long)((s - (double)(time_t)s) * 1e9));
  }
  int status = archive_write_header(w->a, e);
  archive_entry_free(e);
  if (status < ARCHIVE_WARN) return w->status = status;
  const unsigned char *at = data;
  while (!folder && length > 0) {
    la_ssize_t n = archive_write_data(w->a, at, length);
    if (n < 0) return w->status = (int)n;
    if (n == 0) break;
    at += n;
    length -= (size_t)n;
  }
  return w->status = archive_write_finish_entry(w->a);
}

API int la_write_close(writer *w) { return w->status = archive_write_close(w->a); }
API const unsigned char *la_write_bytes(writer *w) { return w->bytes; }
API double la_write_size(writer *w) { return (double)w->size; }
API const char *la_write_error(writer *w) { return archive_error_string(w->a); }

API void la_write_free(writer *w) {
  if (!w) return;
  archive_write_free(w->a);
  free(w->bytes);
  free(w);
}
