import requests
from django.conf import settings


_original_request = requests.sessions.Session.request


def patched_request(self, method, url, **kwargs):

    headers = kwargs.get("headers", {})

    headers["X-Internal-Token"] = settings.INTERNAL_SERVICE_TOKEN

    kwargs["headers"] = headers

    return _original_request(self, method, url, **kwargs)


def apply_patch():

    requests.sessions.Session.request = patched_request