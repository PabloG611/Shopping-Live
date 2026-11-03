from channels.generic.websocket import AsyncWebsocketConsumer
import json

class NotificacionConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_group_name = 'notificaciones'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
 
        await self.accept()
        print('Connection open WS Notificaciones')
 
    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
 
    async def receive(self, text_data):
        """
        Recibe mensajes del cliente en la estructura JSON del listado.
        """
        text_data_json = json.loads(text_data)
        
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'notificaciones_message',
                'id_notificacionusuario': text_data_json.get('id_notificacionusuario'),
                'usuario_id': text_data_json.get('usuario_id'),
                'notificacion': text_data_json.get('notificacion'),
                'leida': text_data_json.get('leida', False),
                'fecha_estado': text_data_json.get('fecha_estado'),
            }
        )
        
    async def notificaciones_message(self, event):
        """
        Envía la notificación al cliente con la estructura del JSON de listado.
        """
        await self.send(text_data=json.dumps({
            'id_notificacionusuario': event.get('id_notificacionusuario'),
            'usuario_id': event.get('usuario_id'),
            'notificacion': event.get('notificacion'),
            'leida': event.get('leida', False),
            'fecha_estado': event.get('fecha_estado'),
        }))