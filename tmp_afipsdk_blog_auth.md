--- title: Autorizar uso de web services de ARCA via API description: Con pocas líneas de código category: [API] pubDate: ago 24, 2024 cover: /images/blog/api-auth-ws.png ---

# Autorizar uso de web services de ARCA via API


Podemos usar Afip SDK para autorizar, de manera automática, el acceso de los certificados que creamos a los diferentes web services, ya que hacerlo de forma manual no solo es difícil, sino que también puede generar errores humanos.

## Requisitos previos
Para poder usar las automatizaciones, primero necesitarás:

- [Obtener un access_token de Afip SDK](https://app.afipsdk.com/)

## 1. Creamos la autorización

Ahora vamos a ejecutar la automatización para [autorizar web service de desarrollo](/docs/automations/auth-web-service-dev/api/), lo primero que debemos hacer es ejecutar una solicitud **POST** al endpoint

```bash
https://app.afipsdk.com/api/v1/automations
```

Con los parametros

| Nombre        | Tipo   | Valor                                                                                                                                                                  |
| ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cuit`      | string | CUIT al cual le queremos generar la autorización                                                                                                                       |
| `username`    | string | Usuario para ingresar a ARCA. Para la mayoría es el mismo CUIT, pero al administrar una sociedad el CUIT con el que se ingresa es el del administrador de la sociedad. |
| `password`    | string | Contraseña para ingresar a ARCA.                                                                                                                                       |
| `alias`       | string | Alias del certificado a autorizar (previamente creado).                                                                                                                |
| `service`        | string | Id del web service a autorizar.                                                                                                                                        |

Y el header con el access_token
```bash
Authorization: Bearer TU_ACCESS_TOKEN_AQUI
```

**Ejemplo**

```json
{
    "automation": "auth-web-service-dev",
    "params": {
        "cuit": "20111111112",
        "username": "20111111112",
        "password": "contraseña#segura?",
        "alias": "afipsdk",
        "service": "wsfe"
    }
}
```

Al crear la autorizacion nos devolverá un `id` y su `status`

**Response**

```json
{
    "status": "in_process",
    "id": "0d1e71e0-8882-4b14-b7f8-c5d716261760"
}
```

## 2. Obtener el resultado

Una vez creada la automatización, esta va a comenzar a ejecutarse. Para obtener el resultado final debés realizar una llamada **GET** al endpoint:

```bash
https://app.afipsdk.com/api/v1/automations/:id
```

`id` Es el ID de la automatización previamente creada.

Y el header con el access_token
```bash
Authorization: Bearer TU_ACCESS_TOKEN_AQUI
```

La automatización va a devolver `{ "status": "in_process" }` hasta que se complete. Te recomendamos chequear el resultado cada 5 segundos hasta que deje de estar `in_process`.

<mark style="color:green;">`STATUS`</mark> `200`

```json
{
    "status": "complete",
    "data": {
        "status": "created"
    }
}
```

<mark style="color:red;">`STATUS`</mark> `400`

```json
{
    "status": "error",
    "data": {
        "statusCode": 400,
        "message": "No existe certificado con el alias afipsdk."
    }
}
```

Ya tenemos la autorización lista para acceder al web service de ARCA.

---

Ante cualquier duda o pregunta al respecto, pueden resolverla rápidamente dentro de la [Comunidad Afip SDK](https://discord.gg/A6TuHEyAZm). Además, puedes unirte para estar al tanto de las novedades y problemas técnicos al usar los servicios de ARCA.

