from datetime import datetime, timedelta
import math


def calcular_horas(fecha_inicio, fecha_fin, hora_inicio, hora_fin):
    # Arreglo de fechas a excluir
    fechas_excluir = [
        #2017
        datetime.strptime('2017-01-01', '%Y-%m-%d'),
        datetime.strptime('2017-01-09', '%Y-%m-%d'),
        datetime.strptime('2017-03-20', '%Y-%m-%d'),
        datetime.strptime('2017-04-13', '%Y-%m-%d'),
        datetime.strptime('2017-04-14', '%Y-%m-%d'),
        datetime.strptime('2017-05-01', '%Y-%m-%d'),
        datetime.strptime('2017-05-29', '%Y-%m-%d'),
        datetime.strptime('2017-06-19', '%Y-%m-%d'),
        datetime.strptime('2017-06-26', '%Y-%m-%d'),
        datetime.strptime('2017-07-03', '%Y-%m-%d'),
        datetime.strptime('2017-07-20', '%Y-%m-%d'),
        datetime.strptime('2017-08-07', '%Y-%m-%d'),
        datetime.strptime('2017-08-21', '%Y-%m-%d'),
        datetime.strptime('2017-10-16', '%Y-%m-%d'),
        datetime.strptime('2017-11-06', '%Y-%m-%d'),
        datetime.strptime('2017-11-13', '%Y-%m-%d'),
        datetime.strptime('2017-12-08', '%Y-%m-%d'),
        datetime.strptime('2017-12-25', '%Y-%m-%d'),
        #2018
        datetime.strptime('2018-01-01', '%Y-%m-%d'), 
        datetime.strptime('2018-01-08', '%Y-%m-%d'),
        datetime.strptime('2018-03-19', '%Y-%m-%d'),
        datetime.strptime('2018-03-29', '%Y-%m-%d'),
        datetime.strptime('2018-03-30', '%Y-%m-%d'),
        datetime.strptime('2018-05-01', '%Y-%m-%d'),
        datetime.strptime('2018-05-14', '%Y-%m-%d'),
        datetime.strptime('2018-06-04', '%Y-%m-%d'),
        datetime.strptime('2018-06-11', '%Y-%m-%d'),
        datetime.strptime('2018-07-02', '%Y-%m-%d'), 
        datetime.strptime('2018-07-20', '%Y-%m-%d'),
        datetime.strptime('2018-08-07', '%Y-%m-%d'),
        datetime.strptime('2018-08-20', '%Y-%m-%d'),
        datetime.strptime('2018-10-15', '%Y-%m-%d'),
        datetime.strptime('2018-11-05', '%Y-%m-%d'),
        datetime.strptime('2018-11-12', '%Y-%m-%d'),
        datetime.strptime('2018-12-08', '%Y-%m-%d'),
        datetime.strptime('2018-12-25', '%Y-%m-%d'),
        #2019
        datetime.strptime('2019-01-01', '%Y-%m-%d'),
        datetime.strptime('2019-01-07', '%Y-%m-%d'),
        datetime.strptime('2019-03-25', '%Y-%m-%d'),
        datetime.strptime('2019-04-18', '%Y-%m-%d'),
        datetime.strptime('2019-04-19', '%Y-%m-%d'),
        datetime.strptime('2019-05-01', '%Y-%m-%d'),
        datetime.strptime('2019-06-03', '%Y-%m-%d'),
        datetime.strptime('2019-06-24', '%Y-%m-%d'),
        datetime.strptime('2019-07-01', '%Y-%m-%d'),
        datetime.strptime('2019-07-20', '%Y-%m-%d'),
        datetime.strptime('2019-08-07', '%Y-%m-%d'),
        datetime.strptime('2019-08-19', '%Y-%m-%d'),
        datetime.strptime('2019-10-14', '%Y-%m-%d'),
        datetime.strptime('2019-11-04', '%Y-%m-%d'),
        datetime.strptime('2019-11-11', '%Y-%m-%d'),
        datetime.strptime('2019-12-08', '%Y-%m-%d'),
        datetime.strptime('2019-12-25', '%Y-%m-%d'),
        #2020
        datetime.strptime('2020-01-01', '%Y-%m-%d'),
        datetime.strptime('2020-01-06', '%Y-%m-%d'),
        datetime.strptime('2020-03-23', '%Y-%m-%d'),
        datetime.strptime('2020-04-09', '%Y-%m-%d'),
        datetime.strptime('2020-04-10', '%Y-%m-%d'),
        datetime.strptime('2020-05-01', '%Y-%m-%d'),
        datetime.strptime('2020-05-25', '%Y-%m-%d'),
        datetime.strptime('2020-06-15', '%Y-%m-%d'),
        datetime.strptime('2020-06-22', '%Y-%m-%d'),
        datetime.strptime('2020-06-29', '%Y-%m-%d'),
        datetime.strptime('2020-07-20', '%Y-%m-%d'),
        datetime.strptime('2020-08-07', '%Y-%m-%d'),
        datetime.strptime('2020-08-17', '%Y-%m-%d'),
        datetime.strptime('2020-10-12', '%Y-%m-%d'),
        datetime.strptime('2020-11-02', '%Y-%m-%d'),
        datetime.strptime('2020-11-16', '%Y-%m-%d'),
        datetime.strptime('2020-12-08', '%Y-%m-%d'),
        datetime.strptime('2020-12-25', '%Y-%m-%d'),
        #2021
        datetime.strptime('2021-01-01', '%Y-%m-%d'),
        datetime.strptime('2021-01-11', '%Y-%m-%d'),
        datetime.strptime('2021-03-22', '%Y-%m-%d'),
        datetime.strptime('2021-04-01', '%Y-%m-%d'),
        datetime.strptime('2021-04-02', '%Y-%m-%d'),
        datetime.strptime('2021-05-01', '%Y-%m-%d'),
        datetime.strptime('2021-05-17', '%Y-%m-%d'),
        datetime.strptime('2021-06-07', '%Y-%m-%d'),
        datetime.strptime('2021-06-14', '%Y-%m-%d'),
        datetime.strptime('2021-07-05', '%Y-%m-%d'),
        datetime.strptime('2021-07-20', '%Y-%m-%d'),
        datetime.strptime('2021-08-07', '%Y-%m-%d'),
        datetime.strptime('2021-08-16', '%Y-%m-%d'),
        datetime.strptime('2021-10-18', '%Y-%m-%d'),
        datetime.strptime('2021-11-01', '%Y-%m-%d'),
        datetime.strptime('2021-11-15', '%Y-%m-%d'),
        datetime.strptime('2021-12-08', '%Y-%m-%d'),
        datetime.strptime('2021-12-25', '%Y-%m-%d'),
        #2022
        datetime.strptime('2022-01-01', '%Y-%m-%d'),
        datetime.strptime('2022-01-10', '%Y-%m-%d'),
        datetime.strptime('2022-03-21', '%Y-%m-%d'),
        datetime.strptime('2022-04-14', '%Y-%m-%d'),
        datetime.strptime('2022-04-15', '%Y-%m-%d'),
        datetime.strptime('2022-05-01', '%Y-%m-%d'),
        datetime.strptime('2022-05-30', '%Y-%m-%d'),
        datetime.strptime('2022-06-20', '%Y-%m-%d'),
        datetime.strptime('2022-06-27', '%Y-%m-%d'),
        datetime.strptime('2022-07-04', '%Y-%m-%d'),
        datetime.strptime('2022-07-20', '%Y-%m-%d'),
        datetime.strptime('2022-08-07', '%Y-%m-%d'),
        datetime.strptime('2022-08-15', '%Y-%m-%d'),
        datetime.strptime('2022-10-17', '%Y-%m-%d'),
        datetime.strptime('2022-11-07', '%Y-%m-%d'),
        datetime.strptime('2022-11-14', '%Y-%m-%d'),
        datetime.strptime('2022-12-08', '%Y-%m-%d'),
        datetime.strptime('2022-12-25', '%Y-%m-%d'),
        #2023
        datetime.strptime('2023-01-01', '%Y-%m-%d'),
        datetime.strptime('2023-01-09', '%Y-%m-%d'),
        datetime.strptime('2023-03-20', '%Y-%m-%d'),
        datetime.strptime('2023-04-06', '%Y-%m-%d'),
        datetime.strptime('2023-04-07', '%Y-%m-%d'),
        datetime.strptime('2023-05-01', '%Y-%m-%d'),
        datetime.strptime('2023-05-22', '%Y-%m-%d'),
        datetime.strptime('2023-06-12', '%Y-%m-%d'),
        datetime.strptime('2023-06-19', '%Y-%m-%d'),
        datetime.strptime('2023-07-03', '%Y-%m-%d'),
        datetime.strptime('2023-07-20', '%Y-%m-%d'),
        datetime.strptime('2023-08-07', '%Y-%m-%d'),
        datetime.strptime('2023-08-21', '%Y-%m-%d'),
        datetime.strptime('2023-10-16', '%Y-%m-%d'),
        datetime.strptime('2023-11-06', '%Y-%m-%d'),
        datetime.strptime('2023-11-13', '%Y-%m-%d'),
        datetime.strptime('2023-12-08', '%Y-%m-%d'),
        datetime.strptime('2023-12-25', '%Y-%m-%d'),
        #2024
        datetime.strptime('2024-01-01', '%Y-%m-%d'),
        datetime.strptime('2024-01-08', '%Y-%m-%d'),
        datetime.strptime('2024-03-25', '%Y-%m-%d'),
        datetime.strptime('2024-03-28', '%Y-%m-%d'),
        datetime.strptime('2024-03-29', '%Y-%m-%d'),
        datetime.strptime('2024-05-01', '%Y-%m-%d'),
        datetime.strptime('2024-05-13', '%Y-%m-%d'),
        datetime.strptime('2024-06-03', '%Y-%m-%d'),
        datetime.strptime('2024-06-10', '%Y-%m-%d'),
        datetime.strptime('2024-07-01', '%Y-%m-%d'),
        datetime.strptime('2024-07-20', '%Y-%m-%d'),
        datetime.strptime('2024-08-07', '%Y-%m-%d'),
        datetime.strptime('2024-08-19', '%Y-%m-%d'),
        datetime.strptime('2024-10-14', '%Y-%m-%d'),
        datetime.strptime('2024-11-04', '%Y-%m-%d'),
        datetime.strptime('2024-11-11', '%Y-%m-%d'),
        datetime.strptime('2024-12-08', '%Y-%m-%d'),
        datetime.strptime('2024-12-25', '%Y-%m-%d'),
        #2025
        datetime.strptime('2025-01-01', '%Y-%m-%d'),
        datetime.strptime('2025-01-06', '%Y-%m-%d'),
        datetime.strptime('2025-03-24', '%Y-%m-%d'),
        datetime.strptime('2025-04-17', '%Y-%m-%d'),
        datetime.strptime('2025-04-18', '%Y-%m-%d'),
        datetime.strptime('2025-05-01', '%Y-%m-%d'),
        datetime.strptime('2025-06-02', '%Y-%m-%d'),
        datetime.strptime('2025-06-23', '%Y-%m-%d'),
        datetime.strptime('2025-06-30', '%Y-%m-%d'),
        datetime.strptime('2025-07-20', '%Y-%m-%d'),
        datetime.strptime('2025-08-07', '%Y-%m-%d'),
        datetime.strptime('2025-08-18', '%Y-%m-%d'),
        datetime.strptime('2025-10-13', '%Y-%m-%d'),
        datetime.strptime('2025-10-13', '%Y-%m-%d'),
        datetime.strptime('2025-11-03', '%Y-%m-%d'),
        datetime.strptime('2025-11-17', '%Y-%m-%d'),
        datetime.strptime('2025-12-08', '%Y-%m-%d'),
        datetime.strptime('2025-12-25', '%Y-%m-%d'),
        ]
    # Convertir 24:00 a 23:59 para evitar errores
    if hora_fin == '24:00':
        hora_fin = '23:59'
    
    fecha_inicio = datetime.strptime(fecha_inicio + ' ' + hora_inicio, '%Y-%m-%d %H:%M')
    fecha_fin = datetime.strptime(fecha_fin + ' ' + hora_fin, '%Y-%m-%d %H:%M')
    horas_totales = 0
    fecha_actual = fecha_inicio

    while fecha_actual.date() <= fecha_fin.date():
        if fecha_actual.weekday() < 5 and fecha_actual.date() not in [f.date() for f in fechas_excluir]:
            if fecha_actual.date() == fecha_inicio.date() and fecha_actual.date() == fecha_fin.date():
                horas_totales += (fecha_fin - fecha_inicio).seconds / 3600
            elif fecha_actual.date() == fecha_inicio.date():
                horas_totales += (datetime.combine(fecha_actual.date(), datetime.max.time()) - fecha_inicio).seconds / 3600
            elif fecha_actual.date() == fecha_fin.date():
                horas_totales += (fecha_fin - datetime.combine(fecha_actual.date(), datetime.min.time())).seconds / 3600
            else:
                horas_totales += 24
        fecha_actual += timedelta(days=1)

    return round(horas_totales, 2)





def calcular_horas_habiles(fecha_inicio, hora_inicio, fecha_fin, hora_fin):
    # Fechas a excluir (días festivos)
    fechas_excluir = [
        #2017
        datetime.strptime('2017-01-01', '%Y-%m-%d'),
        datetime.strptime('2017-01-09', '%Y-%m-%d'),
        datetime.strptime('2017-03-20', '%Y-%m-%d'),
        datetime.strptime('2017-04-13', '%Y-%m-%d'),
        datetime.strptime('2017-04-14', '%Y-%m-%d'),
        datetime.strptime('2017-05-01', '%Y-%m-%d'),
        datetime.strptime('2017-05-29', '%Y-%m-%d'),
        datetime.strptime('2017-06-19', '%Y-%m-%d'),
        datetime.strptime('2017-06-26', '%Y-%m-%d'),
        datetime.strptime('2017-07-03', '%Y-%m-%d'),
        datetime.strptime('2017-07-20', '%Y-%m-%d'),
        datetime.strptime('2017-08-07', '%Y-%m-%d'),
        datetime.strptime('2017-08-21', '%Y-%m-%d'),
        datetime.strptime('2017-10-16', '%Y-%m-%d'),
        datetime.strptime('2017-11-06', '%Y-%m-%d'),
        datetime.strptime('2017-11-13', '%Y-%m-%d'),
        datetime.strptime('2017-12-08', '%Y-%m-%d'),
        datetime.strptime('2017-12-25', '%Y-%m-%d'),
        #2018
        datetime.strptime('2018-01-01', '%Y-%m-%d'), 
        datetime.strptime('2018-01-08', '%Y-%m-%d'),
        datetime.strptime('2018-03-19', '%Y-%m-%d'),
        datetime.strptime('2018-03-29', '%Y-%m-%d'),
        datetime.strptime('2018-03-30', '%Y-%m-%d'),
        datetime.strptime('2018-05-01', '%Y-%m-%d'),
        datetime.strptime('2018-05-14', '%Y-%m-%d'),
        datetime.strptime('2018-06-04', '%Y-%m-%d'),
        datetime.strptime('2018-06-11', '%Y-%m-%d'),
        datetime.strptime('2018-07-02', '%Y-%m-%d'), 
        datetime.strptime('2018-07-20', '%Y-%m-%d'),
        datetime.strptime('2018-08-07', '%Y-%m-%d'),
        datetime.strptime('2018-08-20', '%Y-%m-%d'),
        datetime.strptime('2018-10-15', '%Y-%m-%d'),
        datetime.strptime('2018-11-05', '%Y-%m-%d'),
        datetime.strptime('2018-11-12', '%Y-%m-%d'),
        datetime.strptime('2018-12-08', '%Y-%m-%d'),
        datetime.strptime('2018-12-25', '%Y-%m-%d'),
        #2019
        datetime.strptime('2019-01-01', '%Y-%m-%d'),
        datetime.strptime('2019-01-07', '%Y-%m-%d'),
        datetime.strptime('2019-03-25', '%Y-%m-%d'),
        datetime.strptime('2019-04-18', '%Y-%m-%d'),
        datetime.strptime('2019-04-19', '%Y-%m-%d'),
        datetime.strptime('2019-05-01', '%Y-%m-%d'),
        datetime.strptime('2019-06-03', '%Y-%m-%d'),
        datetime.strptime('2019-06-24', '%Y-%m-%d'),
        datetime.strptime('2019-07-01', '%Y-%m-%d'),
        datetime.strptime('2019-07-20', '%Y-%m-%d'),
        datetime.strptime('2019-08-07', '%Y-%m-%d'),
        datetime.strptime('2019-08-19', '%Y-%m-%d'),
        datetime.strptime('2019-10-14', '%Y-%m-%d'),
        datetime.strptime('2019-11-04', '%Y-%m-%d'),
        datetime.strptime('2019-11-11', '%Y-%m-%d'),
        datetime.strptime('2019-12-08', '%Y-%m-%d'),
        datetime.strptime('2019-12-25', '%Y-%m-%d'),
        #2020
        datetime.strptime('2020-01-01', '%Y-%m-%d'),
        datetime.strptime('2020-01-06', '%Y-%m-%d'),
        datetime.strptime('2020-03-23', '%Y-%m-%d'),
        datetime.strptime('2020-04-09', '%Y-%m-%d'),
        datetime.strptime('2020-04-10', '%Y-%m-%d'),
        datetime.strptime('2020-05-01', '%Y-%m-%d'),
        datetime.strptime('2020-05-25', '%Y-%m-%d'),
        datetime.strptime('2020-06-15', '%Y-%m-%d'),
        datetime.strptime('2020-06-22', '%Y-%m-%d'),
        datetime.strptime('2020-06-29', '%Y-%m-%d'),
        datetime.strptime('2020-07-20', '%Y-%m-%d'),
        datetime.strptime('2020-08-07', '%Y-%m-%d'),
        datetime.strptime('2020-08-17', '%Y-%m-%d'),
        datetime.strptime('2020-10-12', '%Y-%m-%d'),
        datetime.strptime('2020-11-02', '%Y-%m-%d'),
        datetime.strptime('2020-11-16', '%Y-%m-%d'),
        datetime.strptime('2020-12-08', '%Y-%m-%d'),
        datetime.strptime('2020-12-25', '%Y-%m-%d'),
        #2021
        datetime.strptime('2021-01-01', '%Y-%m-%d'),
        datetime.strptime('2021-01-11', '%Y-%m-%d'),
        datetime.strptime('2021-03-22', '%Y-%m-%d'),
        datetime.strptime('2021-04-01', '%Y-%m-%d'),
        datetime.strptime('2021-04-02', '%Y-%m-%d'),
        datetime.strptime('2021-05-01', '%Y-%m-%d'),
        datetime.strptime('2021-05-17', '%Y-%m-%d'),
        datetime.strptime('2021-06-07', '%Y-%m-%d'),
        datetime.strptime('2021-06-14', '%Y-%m-%d'),
        datetime.strptime('2021-07-05', '%Y-%m-%d'),
        datetime.strptime('2021-07-20', '%Y-%m-%d'),
        datetime.strptime('2021-08-07', '%Y-%m-%d'),
        datetime.strptime('2021-08-16', '%Y-%m-%d'),
        datetime.strptime('2021-10-18', '%Y-%m-%d'),
        datetime.strptime('2021-11-01', '%Y-%m-%d'),
        datetime.strptime('2021-11-15', '%Y-%m-%d'),
        datetime.strptime('2021-12-08', '%Y-%m-%d'),
        datetime.strptime('2021-12-25', '%Y-%m-%d'),
        #2022
        datetime.strptime('2022-01-01', '%Y-%m-%d'),
        datetime.strptime('2022-01-10', '%Y-%m-%d'),
        datetime.strptime('2022-03-21', '%Y-%m-%d'),
        datetime.strptime('2022-04-14', '%Y-%m-%d'),
        datetime.strptime('2022-04-15', '%Y-%m-%d'),
        datetime.strptime('2022-05-01', '%Y-%m-%d'),
        datetime.strptime('2022-05-30', '%Y-%m-%d'),
        datetime.strptime('2022-06-20', '%Y-%m-%d'),
        datetime.strptime('2022-06-27', '%Y-%m-%d'),
        datetime.strptime('2022-07-04', '%Y-%m-%d'),
        datetime.strptime('2022-07-20', '%Y-%m-%d'),
        datetime.strptime('2022-08-07', '%Y-%m-%d'),
        datetime.strptime('2022-08-15', '%Y-%m-%d'),
        datetime.strptime('2022-10-17', '%Y-%m-%d'),
        datetime.strptime('2022-11-07', '%Y-%m-%d'),
        datetime.strptime('2022-11-14', '%Y-%m-%d'),
        datetime.strptime('2022-12-08', '%Y-%m-%d'),
        datetime.strptime('2022-12-25', '%Y-%m-%d'),
        #2023
        datetime.strptime('2023-01-01', '%Y-%m-%d'),
        datetime.strptime('2023-01-09', '%Y-%m-%d'),
        datetime.strptime('2023-03-20', '%Y-%m-%d'),
        datetime.strptime('2023-04-06', '%Y-%m-%d'),
        datetime.strptime('2023-04-07', '%Y-%m-%d'),
        datetime.strptime('2023-05-01', '%Y-%m-%d'),
        datetime.strptime('2023-05-22', '%Y-%m-%d'),
        datetime.strptime('2023-06-12', '%Y-%m-%d'),
        datetime.strptime('2023-06-19', '%Y-%m-%d'),
        datetime.strptime('2023-07-03', '%Y-%m-%d'),
        datetime.strptime('2023-07-20', '%Y-%m-%d'),
        datetime.strptime('2023-08-07', '%Y-%m-%d'),
        datetime.strptime('2023-08-21', '%Y-%m-%d'),
        datetime.strptime('2023-10-16', '%Y-%m-%d'),
        datetime.strptime('2023-11-06', '%Y-%m-%d'),
        datetime.strptime('2023-11-13', '%Y-%m-%d'),
        datetime.strptime('2023-12-08', '%Y-%m-%d'),
        datetime.strptime('2023-12-25', '%Y-%m-%d'),
        #2024
        datetime.strptime('2024-01-01', '%Y-%m-%d'),
        datetime.strptime('2024-01-08', '%Y-%m-%d'),
        datetime.strptime('2024-03-25', '%Y-%m-%d'),
        datetime.strptime('2024-03-28', '%Y-%m-%d'),
        datetime.strptime('2024-03-29', '%Y-%m-%d'),
        datetime.strptime('2024-05-01', '%Y-%m-%d'),
        datetime.strptime('2024-05-13', '%Y-%m-%d'),
        datetime.strptime('2024-06-03', '%Y-%m-%d'),
        datetime.strptime('2024-06-10', '%Y-%m-%d'),
        datetime.strptime('2024-07-01', '%Y-%m-%d'),
        datetime.strptime('2024-07-20', '%Y-%m-%d'),
        datetime.strptime('2024-08-07', '%Y-%m-%d'),
        datetime.strptime('2024-08-19', '%Y-%m-%d'),
        datetime.strptime('2024-10-14', '%Y-%m-%d'),
        datetime.strptime('2024-11-04', '%Y-%m-%d'),
        datetime.strptime('2024-11-11', '%Y-%m-%d'),
        datetime.strptime('2024-12-08', '%Y-%m-%d'),
        datetime.strptime('2024-12-25', '%Y-%m-%d'),
        #2025
        datetime.strptime('2025-01-01', '%Y-%m-%d'),
        datetime.strptime('2025-01-06', '%Y-%m-%d'),
        datetime.strptime('2025-03-24', '%Y-%m-%d'),
        datetime.strptime('2025-04-17', '%Y-%m-%d'),
        datetime.strptime('2025-04-18', '%Y-%m-%d'),
        datetime.strptime('2025-05-01', '%Y-%m-%d'),
        datetime.strptime('2025-06-02', '%Y-%m-%d'),
        datetime.strptime('2025-06-23', '%Y-%m-%d'),
        datetime.strptime('2025-06-30', '%Y-%m-%d'),
        datetime.strptime('2025-07-20', '%Y-%m-%d'),
        datetime.strptime('2025-08-07', '%Y-%m-%d'),
        datetime.strptime('2025-08-18', '%Y-%m-%d'),
        datetime.strptime('2025-10-13', '%Y-%m-%d'),
        datetime.strptime('2025-11-03', '%Y-%m-%d'),
        datetime.strptime('2025-11-17', '%Y-%m-%d'),
        datetime.strptime('2025-12-08', '%Y-%m-%d'),
        datetime.strptime('2025-12-25', '%Y-%m-%d'),
        ]

    # Horas hábiles
    hora_inicio_am = 8
    hora_fin_am = 12
    hora_inicio_pm = 14
    hora_fin_pm = 18

    # Convertir fechas a objetos datetime y combinar con las horas
    fecha_inicio = datetime.strptime(fecha_inicio + ' ' + hora_inicio, '%Y-%m-%d %H:%M')
    fecha_fin = datetime.strptime(fecha_fin + ' ' + hora_fin, '%Y-%m-%d %H:%M')

    horas_totales = 0
    fecha_actual = fecha_inicio

    while fecha_actual <= fecha_fin:
        if fecha_actual.weekday() < 5 and fecha_actual.date() not in [f.date() for f in fechas_excluir]:
            if fecha_actual.date() == fecha_inicio.date():
                # Día de inicio, desde hora_inicio
                horas_totales += calcular_horas_del_dia(fecha_inicio, datetime.combine(fecha_actual, datetime.max.time()), hora_inicio_am, hora_fin_am, hora_inicio_pm, hora_fin_pm)
            elif fecha_actual.date() == fecha_fin.date():
                # Día de fin, hasta hora_fin
                horas_totales += calcular_horas_del_dia(datetime.combine(fecha_actual, datetime.min.time()), fecha_fin, hora_inicio_am, hora_fin_am, hora_inicio_pm, hora_fin_pm)
            else:
                # Días completos entre la fecha de inicio y la fecha de fin
                inicio_dia = datetime.combine(fecha_actual, datetime.min.time()).replace(hour=hora_inicio_am)
                fin_dia = datetime.combine(fecha_actual, datetime.min.time()).replace(hour=hora_fin_pm)
                horas_totales += calcular_horas_del_dia(inicio_dia, fin_dia, hora_inicio_am, hora_fin_am, hora_inicio_pm, hora_fin_pm)
        fecha_actual += timedelta(days=1)

    return math.floor(horas_totales)


def calcular_horas_del_dia(fecha_inicio, fecha_fin, hora_inicio_am, hora_fin_am, hora_inicio_pm, hora_fin_pm):
    horas = 0

    # Intervalo de la mañana
    if fecha_inicio < fecha_inicio.replace(hour=hora_fin_am) and fecha_fin > fecha_inicio.replace(hour=hora_inicio_am):
        inicio_am = max(fecha_inicio, fecha_inicio.replace(hour=hora_inicio_am, minute=0))
        fin_am = min(fecha_fin, fecha_fin.replace(hour=hora_fin_am, minute=0))
        if inicio_am < fin_am:
            horas += (fin_am - inicio_am).total_seconds() / 3600

    # Intervalo de la tarde
    if fecha_inicio < fecha_inicio.replace(hour=hora_fin_pm) and fecha_fin > fecha_inicio.replace(hour=hora_inicio_pm):
        inicio_pm = max(fecha_inicio, fecha_inicio.replace(hour=hora_inicio_pm, minute=0))
        fin_pm = min(fecha_fin, fecha_fin.replace(hour=hora_fin_pm, minute=0))
        if inicio_pm < fin_pm:
            horas += (fin_pm - inicio_pm).total_seconds() / 3600

    return horas