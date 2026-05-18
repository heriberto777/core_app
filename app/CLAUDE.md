# INSTRUCCIONES PARA CLAUDE CODE

## Regla crítica de contexto
Cuando el usuario diga "guarda estado" o cuando detectes que 
llevas más de 20 archivos procesados en la sesión:
1. Escribe inmediatamente MIGRATION_STATE.md con todo lo hecho
2. Avisa al usuario que debe iniciar sesión nueva
3. NO esperes a que el contexto colapse

## Proyecto
- React + Vite + Tailwind CSS
- Atomic Design: atomos → moleculas → organismos → templates
- Migración: styled-components → Tailwind CSS

## Al iniciar sesión
Lee siempre MIGRATION_STATE.md si existe y continúa desde ahí.