--- title: Crear certificado para usar web services de ARCA via API description: Con pocas líneas de código category: [API] pubDate: ago 24, 2024 cover: /images/blog/api-create-cert.png ---

# Crear certificado para usar web services de ARCA via API


Podemos usar Afip SDK para crear certificados de manera automática, ya que hacerlo de forma manual no solo es difícil, sino que también puede generar errores humanos.

## Requisitos previos
Para poder usar las automatizaciones, primero necesitarás:

- [Obtener un access_token de Afip SDK](https://app.afipsdk.com/)

## 1. Creamos el certificado

Ahora vamos a ejecutar la automatización para [crear el certificado de desarrollo](/docs/automations/create-cert-dev/api/), lo primero que debemos hacer es ejecutar una solicitud **POST** al endpoint

```bash
https://app.afipsdk.com/api/v1/automations
```

Con los parametros

| Nombre        | Tipo   | Valor                                                                                                                                                                  |
| ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cuit`      | string | CUIT al cual le queremos generar el certificado                                                                                                                        |
| `username`    | string | Usuario para ingresar a ARCA. Para la mayoría es el mismo CUIT, pero al administrar una sociedad el CUIT con el que se ingresa es el del administrador de la sociedad. |
| `password`    | string | Contraseña para ingresar a ARCA.                                                                                                                                       |
| `alias`       | string | Alias para el certificado (Nombre para reconocerlo en ARCA), un alias puede tener muchos certificados, si estas renovando un certificado podes utilizar el mismo alias |

Y el header con el access_token
```bash
Authorization: Bearer TU_ACCESS_TOKEN_AQUI
```

**Ejemplo**

```json
{
    "automation": "create-cert-dev",
    "params": {
        "cuit": "20111111112",
        "username": "20111111112",
        "password": "contraseña#segura?",
        "alias": "afipsdk"
    }
}
```
Al crear el certificado nos devolverá un `id` y su `status`

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
        "cert": "-----BEGIN CERTIFICATE-----\nMIIDRzC...",
        "key": "-----BEGIN RSA PRIVATE KEY-----\r\nMIIEowIBAAKCA..."
    }
}
```

<mark style="color:red;">`STATUS`</mark> `400`

```json
{
    "status": "error",
    "data": {
        "message":"Número de CUIL/CUIT incorrecto"
    }
}
```

Ya tenemos nuestro certificado y key para acceder a los web services de ARCA. 

Ahora para poder acceder a un web service primero debemos [Autorizar uso de web services de ARCA via API](/blog/autorizar-uso-de-web-services-de-afip-via-api/).

---

Ante cualquier duda o pregunta al respecto, pueden resolverla rápidamente dentro de la [Comunidad Afip SDK](https://discord.gg/A6TuHEyAZm). Además, puedes unirte para estar al tanto de las novedades y problemas técnicos al usar los servicios de ARCA.

