#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'shopping_live.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc


    execute_from_command_line(sys.argv)

# def main():
#     import os

#     if os.name == 'nt':
#         os.environ['PATH'] = r"C:\OSGeo4W\bin;" + os.environ.get('PATH', '')
#         os.add_dll_directory(r"C:\OSGeo4W\bin")
#         os.environ['GDAL_LIBRARY_PATH'] = r"C:\OSGeo4W\bin\gdal309.dll"
#         os.environ['GEOS_LIBRARY_PATH'] = r"C:\OSGeo4W\bin\geos_c.dll"

#     os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sgai.settings')

#     from django.core.management import execute_from_command_line
#     execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()