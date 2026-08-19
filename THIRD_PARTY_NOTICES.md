# Third-party notices

Nooklet source code is licensed under the [MIT License](LICENSE). The production image also contains third-party runtimes and media tools under their own licenses. This notice records the YouTube runtime components added directly by the image; Debian package metadata under `/usr/share/doc` and npm package metadata remain the complete version-specific notice sources for the built image.

## yt-dlp and bundled EJS scripts

- Component: official yt-dlp Unix zipimport distribution
- Pinned release: `2026.07.04`
- Asset: `yt-dlp`
- SHA-256: `495be29ff4d9d4e9be7eabdfef225221e5d5282e77f2f505abc6dca80349f3fd`
- Source and release: <https://github.com/yt-dlp/yt-dlp/releases/tag/2026.07.04>
- Upstream license: [The Unlicense](https://github.com/yt-dlp/yt-dlp/blob/2026.07.04/LICENSE)

The official zipimport asset bundles matching `yt-dlp-ejs` challenge scripts. yt-dlp and yt-dlp-ejs are released under the Unlicense. Their bundled JavaScript parser/generator dependencies include Meriyah under the ISC License and Astring under the MIT License. Upstream describes the distribution-specific licensing in the [yt-dlp release documentation](https://github.com/yt-dlp/yt-dlp#licensing) and the [yt-dlp-ejs repository](https://github.com/yt-dlp/ejs#licensing).

The Unlicense notice supplied by upstream states that the software is free and unencumbered software released into the public domain and is provided without warranty. Refer to the linked upstream license for the complete terms and disclaimer.

## BgUtils PO-token provider

- Component: `bgutil-ytdlp-pot-provider` plugin and internal provider service
- Pinned plugin release: `1.3.1`
- Plugin SHA-256: `b8ceec7f76143da172aaf5ebeec0c2d218e5680c063b931586bca48567069b38`
- Pinned provider source commit: `fbe4ed47f3b63cf061f1158f18f74bcc90e54033`
- Provider source SHA-256: `cbc8c2e54126ec38f4c2a278b3cab685d337cadc3e7f09762116e3b28be18b5f`
- Source and release: <https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/tag/1.3.1>
- Provider session-binding fix: <https://github.com/Brainicism/bgutil-ytdlp-pot-provider/pull/243>
- Upstream license: [GPL-3.0](https://github.com/Brainicism/bgutil-ytdlp-pot-provider/blob/1.3.1/LICENSE)

The provider is used only on the private Compose network. It receives public YouTube challenge
context from yt-dlp and returns per-video proof-of-origin tokens. Nooklet does not expose the
provider port to the host and does not download provider code at runtime. The provider image is
built from the pinned, checksum-verified source above. Nooklet replaces upstream log statements
that printed generated PO and integrity tokens with non-sensitive debug messages. The complete
corresponding patched source archive and GPL license are included under `/licenses` in that image.
The pinned fix vendors a `parseLooseJSON` helper from BgUtils v4.0.3 under the MIT License, as
documented by its author.

### Meriyah — ISC License

Copyright (c) 2019 and later, KFlash and others.

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

### Astring — MIT License

Copyright (c) 2015, David Bonnet <david@bonnet.cc>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Python

- Component: Debian Bookworm Python 3 runtime
- Package source: <https://packages.debian.org/bookworm/python3>
- Upstream: <https://www.python.org/>
- License terms: [Python Software Foundation License Version 2 and incorporated-software notices](https://docs.python.org/3/license.html)

The installed Debian package's version-specific copyright and incorporated-software notices are available inside the image under `/usr/share/doc/python3*/copyright` and related dependency package directories.

## ffmpeg

- Component: Debian Bookworm ffmpeg package and shared-library dependencies
- Package source and copyright inventory: <https://sources.debian.org/copyright/license/ffmpeg/>
- Upstream: <https://ffmpeg.org/>
- License overview: <https://ffmpeg.org/legal.html>

Most FFmpeg source files are licensed under LGPL-2.1-or-later; optional components may use GPL-2.0-or-later or compatible licenses. The effective terms depend on the Debian build configuration and linked libraries. The authoritative version-specific copyright inventory is retained inside the image at `/usr/share/doc/ffmpeg/copyright` and in the corresponding library package directories. `ffmpeg -L` prints the license statement for the installed binary.

## Source availability

The Dockerfile records the exact yt-dlp release asset and checksum. Debian package source and copyright records are available from the linked Debian Sources pages and the package metadata retained in the image. Nooklet does not modify these third-party binaries.
