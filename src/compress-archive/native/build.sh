#!/bin/bash
# Builds libarchive with zlib, bzip2, xz (liblzma) and mbedTLS for WebAssembly, inside the
# emscripten/emsdk image (scripts/build-libarchive.mjs runs it, with the sources already checked):
#   /sources   the release archives (their versions in V_ZLIB, V_BZIP2, V_XZ, V_MBEDTLS, V_LIBARCHIVE)
#   /native    this folder
#   /out       the results
# (not BZIP2=…: bzip2 reads its options from that variable)
# Results: /out/libarchive.js (ES module for the browser, the WebAssembly inside it),
# /out/libarchive.node.mjs (the same for Node, only for the tests) and /out/licenses/<name>/LICENSE.
set -euo pipefail

: "${V_ZLIB:?}" "${V_BZIP2:?}" "${V_XZ:?}" "${V_MBEDTLS:?}" "${V_LIBARCHIVE:?}"
WORK=/tmp/work
PREFIX=$(em-config CACHE)/sysroot   # where CMake and configure find the libraries by themselves
FLAGS="-Oz -flto"
JOBS=$(nproc)
mkdir -p "$WORK" /out/licenses
cd "$WORK"
for f in /sources/*; do tar -xf "$f"; done

license() { mkdir -p "/out/licenses/$1" && cp "$2" "/out/licenses/$1/LICENSE"; }

# zlib and bzip2: a handful of C files each (not zlib's gz* files: libarchive does not use them)
cd "$WORK/zlib-$V_ZLIB"
emcc $FLAGS -c adler32.c compress.c crc32.c deflate.c infback.c inffast.c inflate.c inftrees.c trees.c uncompr.c zutil.c
emar rcs "$PREFIX/lib/libz.a" ./*.o
cp zlib.h zconf.h "$PREFIX/include/"
license zlib LICENSE

cd "$WORK/bzip2-$V_BZIP2"
emcc $FLAGS -c blocksort.c huffman.c crctable.c randtable.c compress.c decompress.c bzlib.c
emar rcs "$PREFIX/lib/libbz2.a" ./*.o
cp bzlib.h "$PREFIX/include/"
license bzip2 LICENSE

# xz: only liblzma, no threads (WebAssembly without workers), no translations
cd "$WORK/xz-$V_XZ"
CFLAGS="$FLAGS" emconfigure ./configure --host=wasm32-unknown-emscripten --prefix="$PREFIX" \
  --disable-shared --enable-static --disable-threads --disable-nls --disable-xz --disable-xzdec \
  --disable-lzmadec --disable-lzmainfo --disable-lzma-links --disable-scripts --disable-doc > /dev/null
emmake make -j"$JOBS" -C src/liblzma install > /dev/null
license xz COPYING.0BSD

# mbedTLS: only the cryptography (AES and the hashes of zip encryption)
cd "$WORK/mbedtls-$V_MBEDTLS"
emcmake cmake -S . -B build -DCMAKE_BUILD_TYPE=MinSizeRel -DCMAKE_C_FLAGS="$FLAGS" -DCMAKE_INSTALL_PREFIX="$PREFIX" \
  -DENABLE_PROGRAMS=OFF -DENABLE_TESTING=OFF -DGEN_FILES=OFF -DMBEDTLS_FATAL_WARNINGS=OFF \
  -DUSE_SHARED_MBEDTLS_LIBRARY=OFF -DUSE_STATIC_MBEDTLS_LIBRARY=ON > /dev/null
cmake --build build -j"$JOBS" --target install > /dev/null
license mbedtls LICENSE

# libarchive: the library only, with the formats and filters above
cd "$WORK/libarchive-$V_LIBARCHIVE"
emcmake cmake -S . -B build -DCMAKE_BUILD_TYPE=MinSizeRel -DCMAKE_C_FLAGS="$FLAGS" -DCMAKE_INSTALL_PREFIX="$PREFIX" \
  -DBUILD_SHARED_LIBS=OFF -DENABLE_TAR=OFF -DENABLE_CPIO=OFF -DENABLE_CAT=OFF -DENABLE_UNZIP=OFF -DENABLE_TEST=OFF \
  -DENABLE_ZLIB=ON -DENABLE_BZip2=ON -DENABLE_LZMA=ON -DENABLE_MBEDTLS=ON -DENABLE_OPENSSL=OFF -DENABLE_NETTLE=OFF \
  -DENABLE_CNG=OFF -DENABLE_ZSTD=OFF -DENABLE_LZ4=OFF -DENABLE_LZO=OFF -DENABLE_LIBB2=OFF -DENABLE_LIBXML2=OFF \
  -DENABLE_EXPAT=OFF -DENABLE_PCREPOSIX=OFF -DENABLE_PCRE2POSIX=OFF -DENABLE_LIBGCC=OFF -DENABLE_ACL=OFF \
  -DENABLE_XATTR=OFF -DENABLE_ICONV=ON -DENABLE_WERROR=OFF > /tmp/libarchive-cmake.log
grep -E 'Found (ZLIB|BZip2|LibLZMA|MbedTLS)|HAVE_LIBMBEDCRYPTO|HAVE_LZMA_H|HAVE_BZLIB_H|HAVE_ZLIB_H' /tmp/libarchive-cmake.log || true
cmake --build build -j"$JOBS" --target install > /dev/null
license libarchive COPYING

# Emscripten's runtime and its C library (musl) go into the result too
license emscripten /emsdk/upstream/emscripten/LICENSE
license musl /emsdk/upstream/emscripten/system/lib/libc/musl/COPYRIGHT
cp /emsdk/upstream/emscripten/system/lib/libc/musl/VERSION /out/licenses/musl/VERSION

# The calls of the app, linked with everything above
LIBS="$PREFIX/lib/libarchive.a $PREFIX/lib/libmbedcrypto.a $PREFIX/lib/liblzma.a $PREFIX/lib/libbz2.a $PREFIX/lib/libz.a"
LINK="$FLAGS -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createLibarchive -sSINGLE_FILE=1 -sALLOW_MEMORY_GROWTH=1
  -sMAXIMUM_MEMORY=2gb -sSTACK_SIZE=1mb -sEXPORTED_FUNCTIONS=_malloc,_free -sEXPORTED_RUNTIME_METHODS=UTF8ToString,stringToNewUTF8,HEAPU8
  -sINCOMING_MODULE_JS_API=[] -sDYNAMIC_EXECUTION=0 -sTEXTDECODER=2"
emcc /native/glue.c $LIBS $LINK -sENVIRONMENT=web,worker -o /out/libarchive.js
emcc /native/glue.c $LIBS $LINK -sENVIRONMENT=node -o /out/libarchive.node.mjs
ls -l /out
