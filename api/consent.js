// Vercel Serverless Function
// Recebe email + telefone + consentimento e inscreve o perfil no canal WhatsApp do Klaviyo

const KLAVIYO_PRIVATE_KEY = process.env.KLAVIYO_PRIVATE_KEY;
const KLAVIYO_LIST_ID = "R8VLFs"; // WhatsApp Subscribers

const ALLOWED_ORIGINS = [
  "https://seguro.dalcotone.com.br",
  "https://dalcotone.com.br",
  "https://www.dalcotone.com.br"
];

function setCors(res, origin) {
  var allowed = ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0];
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function normalizePhone(raw) {
  if (!raw) return "";
  var digits = String(raw).replace(/\D/g, "");
  digits = digits.replace(/^0+/, "");
  if (digits.length >= 12 && digits.indexOf("55") === 0) {
    return "+" + digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return "+55" + digits;
  }
  return "+55" + digits;
}

module.exports = async function handler(req, res) {
  var origin = req.headers.origin || "";
  setCors(res, origin);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    var body = req.body;
    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    var email = (body.email || "").trim();
    var phone = normalizePhone(body.phone || "");
    var orderId = body.order_id || "";

    if (!phone) {
      res.status(400).json({ error: "Telefone obrigatorio" });
      return;
    }

    var headers = {
      "Authorization": "Klaviyo-API-Key " + KLAVIYO_PRIVATE_KEY,
      "Content-Type": "application/json",
      "revision": "2024-10-15"
    };

    // ETAPA 1: Inscrever no canal WhatsApp (sem properties)
    var profileAttrs = {
      phone_number: phone,
      subscriptions: {
        whatsapp: {
          marketing: { consent: "SUBSCRIBED" }
        }
      }
    };
    if (email) {
      profileAttrs.email = email;
    }

    var subscribePayload = {
      data: {
        type: "profile-subscription-bulk-create-job",
        attributes: {
          profiles: {
            data: [
              {
                type: "profile",
                attributes: profileAttrs
              }
            ]
          }
        },
        relationships: {
          list: {
            data: { type: "list", id: KLAVIYO_LIST_ID }
          }
        }
      }
    };

    var subResp = await fetch("https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/", {
      method: "POST",
      headers: headers,
      body: JSON.stringify(subscribePayload)
    });

    if (!(subResp.status === 202 || subResp.ok)) {
      var subErr = await subResp.text();
      res.status(subResp.status).json({ error: "Subscribe error", detail: subErr });
      return;
    }

    // ETAPA 2: Salvar propriedades personalizadas via upsert de perfil
    var profilePayload = {
      data: {
        type: "profile",
        attributes: {
          phone_number: phone,
          properties: {
            whatsapp_consent: true,
            whatsapp_consent_date: new Date().toISOString(),
            whatsapp_consent_source: "pagina_obrigado_yampi",
            whatsapp_consent_order_id: String(orderId)
          }
        }
      }
    };
    if (email) {
      profilePayload.data.attributes.email = email;
    }

    await fetch("https://a.klaviyo.com/api/profile-import/", {
      method: "POST",
      headers: headers,
      body: JSON.stringify(profilePayload)
    });

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error", detail: String(err) });
  }
};
