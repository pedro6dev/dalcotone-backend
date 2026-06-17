// Vercel Serverless Function
// Recebe email + telefone + consentimento e inscreve o perfil no canal WhatsApp do Klaviyo

const KLAVIYO_PRIVATE_KEY = process.env.KLAVIYO_PRIVATE_KEY;
const KLAVIYO_LIST_ID = "R8VLFs"; // WhatsApp Subscribers

// Domínios autorizados a chamar este backend
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

// Normaliza telefone para o formato E.164 (+55...)
function normalizePhone(raw) {
  if (!raw) return "";
  var digits = String(raw).replace(/\D/g, "");
  // Remove zeros à esquerda
  digits = digits.replace(/^0+/, "");
  // Se já começa com 55 e tem 12-13 dígitos, assume que tem código do país
  if (digits.length >= 12 && digits.indexOf("55") === 0) {
    return "+" + digits;
  }
  // Se tem 10 ou 11 dígitos (DDD + número), adiciona +55
  if (digits.length === 10 || digits.length === 11) {
    return "+55" + digits;
  }
  // Fallback: adiciona +55 mesmo assim
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

    // API v3 do Klaviyo - Subscribe Profiles (bulk subscribe job)
    // Inscreve o perfil no canal WhatsApp da lista WhatsApp Subscribers
    var subscribePayload = {
      data: {
        type: "profile-subscription-bulk-create-job",
        attributes: {
          profiles: {
            data: [
              {
                type: "profile",
                attributes: {
                  email: email || undefined,
                  phone_number: phone,
                  subscriptions: {
                    whatsapp: {
                      marketing: {
                        consent: "SUBSCRIBED"
                      }
                    }
                  },
                  properties: {
                    whatsapp_consent: true,
                    whatsapp_consent_date: new Date().toISOString(),
                    whatsapp_consent_source: "pagina_obrigado_yampi",
                    whatsapp_consent_order_id: String(orderId)
                  }
                }
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

    var resp = await fetch("https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/", {
      method: "POST",
      headers: {
        "Authorization": "Klaviyo-API-Key " + KLAVIYO_PRIVATE_KEY,
        "Content-Type": "application/json",
        "revision": "2024-10-15"
      },
      body: JSON.stringify(subscribePayload)
    });

    if (resp.status === 202 || resp.ok) {
      res.status(200).json({ success: true });
    } else {
      var errText = await resp.text();
      res.status(resp.status).json({ error: "Klaviyo error", detail: errText });
    }
  } catch (err) {
    res.status(500).json({ error: "Server error", detail: String(err) });
  }
};
