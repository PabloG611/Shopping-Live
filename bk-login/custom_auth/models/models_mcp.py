import uuid
from django.db import models
from django.contrib.auth.models import User
from decouple import config
from cryptography.fernet import Fernet
from cryptography.fernet import InvalidToken

class Tool(models.Model):
    id_tool = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'eco_mcp_tool'
        verbose_name_plural = 'tools'

    def __str__(self):
        return str(self.id_tool)

class Permission(models.Model):
    id_permission = models.AutoField(primary_key=True)
    code_permission = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'eco_mcp_permission'
        verbose_name_plural = 'permissions'

    def __str__(self):
        return str(self.id_permission)

class RolePermission(models.Model):
    id_role_permission = models.AutoField(primary_key=True)
    id_agente_catalogo = models.SmallIntegerField()
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'eco_mcp_role_permission'
        verbose_name_plural = 'role permissions'

    def __str__(self):
        return str(self.id_role_permission)

class ToolPermission(models.Model):
    id_tool_permission = models.AutoField(primary_key=True)
    tool = models.ForeignKey(Tool, on_delete=models.CASCADE)
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'eco_mcp_tool_permission'
        verbose_name_plural = 'tool permissions'

    def __str__(self):
        return str(self.id_tool_permission)
        