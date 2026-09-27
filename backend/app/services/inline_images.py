"""
Make images uploaded to this server visible to recipients.

The editor stores uploaded images as URLs of this machine, for example
http://localhost:5173/uploads/assets/x.png, which nobody outside can load.
At send time those are either pointed at the public address of the server or,
when there is none, embedded in the message itself (cid: images).
"""
import hashlib
import mimetypes
import os
import re
from urllib.parse import urlparse

from app.config import settings
from app.services.provider_config import tracking_url_is_public, _LOCAL_HOSTS

UPLOADS_ROOT = os.path.realpath(
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
)
MAX_INLINE_BYTES = 5 * 1024 * 1024

_IMG_SRC = re.compile(r"""(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2""", re.IGNORECASE | re.DOTALL)

# path -> (mtime, bytes); a campaign reuses the same few files for every recipient
_file_cache: dict[str, tuple[float, bytes]] = {}


def _local_upload_path(src: str):
    """The file on disk behind an image URL of this server, or None."""
    parsed = urlparse(src.strip())
    if parsed.scheme not in ("", "http", "https"):
        return None
    if (parsed.hostname or "").lower() not in _LOCAL_HOSTS:
        return None
    if not parsed.path.startswith("/uploads/"):
        return None
    path = os.path.realpath(os.path.join(UPLOADS_ROOT, parsed.path[len("/uploads/"):]))
    # Stay inside the uploads folder whatever the URL says
    if os.path.commonpath([path, UPLOADS_ROOT]) != UPLOADS_ROOT or not os.path.isfile(path):
        return None
    return parsed.path, path


def _read(path: str):
    mtime = os.path.getmtime(path)
    cached = _file_cache.get(path)
    if cached and cached[0] == mtime:
        return cached[1]
    if os.path.getsize(path) > MAX_INLINE_BYTES:
        return None
    with open(path, "rb") as handle:
        data = handle.read()
    _file_cache[path] = (mtime, data)
    return data


def localize_images(html: str) -> tuple[str, list]:
    """
    Returns the HTML with reachable image sources, plus the inline attachments
    it now refers to (empty when the images are served from a public address).
    """
    if not html or "<img" not in html.lower():
        return html, []

    public = tracking_url_is_public()
    base_url = (settings.TRACKING_BASE_URL or "").rstrip("/")
    inline: dict[str, dict] = {}

    def replace(match: re.Match) -> str:
        found = _local_upload_path(match.group(3))
        if not found:
            return match.group(0)
        url_path, file_path = found
        quote = match.group(2)

        if public:
            return f"{match.group(1)}{quote}{base_url}{url_path}{quote}"

        if file_path not in inline:
            data = _read(file_path)
            if data is None:
                return match.group(0)
            digest = hashlib.sha1(file_path.encode("utf-8")).hexdigest()[:16]
            inline[file_path] = {
                "filename": os.path.basename(file_path),
                "content": data,
                "content_id": f"img-{digest}@inline",
                "content_type": mimetypes.guess_type(file_path)[0] or "application/octet-stream",
            }
        return f"{match.group(1)}{quote}cid:{inline[file_path]['content_id']}{quote}"

    return _IMG_SRC.sub(replace, html), list(inline.values())
