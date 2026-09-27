import re
from urllib.parse import quote
from app.config import settings


def inject_tracking(html_body: str, recipient_id: int, campaign_id: int) -> str:
    """
    Inject open tracking pixel and wrap links for click tracking.
    Called at send-time per-recipient.
    """
    base_url = settings.TRACKING_BASE_URL

    # 1. Click tracking: wrap all href links
    html_body = _wrap_links(html_body, recipient_id, campaign_id, base_url)

    # 2. Open tracking: inject 1x1 pixel before </body>
    pixel = f'<img src="{base_url}/track/open/{recipient_id}" width="1" height="1" style="display:none;" alt="" />'
    if "</body>" in html_body:
        html_body = html_body.replace("</body>", f"{pixel}</body>")
    else:
        html_body += pixel

    return html_body


def _wrap_links(html_body: str, recipient_id: int, campaign_id: int, base_url: str) -> str:
    """Replace all <a href="..."> links with tracking redirect URLs."""
    
    def replace_link(match):
        original_url = match.group(1)
        # Don't wrap unsubscribe links or mailto
        if "unsubscribe" in original_url.lower() or original_url.startswith("mailto:"):
            return match.group(0)
        encoded_url = quote(original_url, safe="")
        tracking_url = f"{base_url}/track/click/{recipient_id}?url={encoded_url}&cid={campaign_id}"
        return f'href="{tracking_url}"'

    pattern = r'href="([^"]+)"'
    return re.sub(pattern, replace_link, html_body)
