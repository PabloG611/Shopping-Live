from django.urls import path
from rest_framework import routers
from custom_auth.views import *
from custom_auth.services import *

app_name = 'auth'
routers = routers.DefaultRouter()

urlpatterns = [
    path('', auth),
    path('external/mobile/', external_mobile_login),
    path('microsoft/', microsoft_login),
    path('microsoft/session/', microsoft_session),
    path('microsoft/mobile_session/', mobile_exchange_token),
    path('microsoft/permissions/', update_microsoft_permissions),
    path('2fa/', two_factor_auth),
    path('connect_device/', connect_device),
    path('refresh_token/', refresh_token),
    path('logout/', logout),
]
