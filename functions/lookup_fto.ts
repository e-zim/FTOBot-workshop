import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { FTORequestsDatastore } from "../datastores/fto_requests.ts";

// Define the inputs needed for a time off request
export const LookupFTO = DefineFunction({
  callback_id: "lookup_fto",
  title: "Lookup FTO",
  description: "Query the submitted FTO requests",
  source_file: "functions/lookup_fto.ts",
  input_parameters: {
    properties: {
      interactivity: {
        type: Schema.slack.types.interactivity,
      },
      employee: {
        type: Schema.slack.types.user_id,
        description: "The employee to search for",
      },
    },
    required: ["interactivity", "employee"],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

// Lookup FTO requests for a given employee
export default SlackFunction(
  LookupFTO,
  async ({ inputs, client }) => {
    const { employee } = inputs;

    // Query the datastore
    const getResponse = await client.apps.datastore.query<
      typeof FTORequestsDatastore.definition
    >({
      datastore: "fto_requests",
      expression: "#employee_id = :employee",
      expression_attributes: { "#employee_id": "employee" },
      expression_values: { ":employee": employee },
    });

    if (!getResponse.ok) {
      return { error: `Failed to get requests: ${getResponse.error}` };
    }

    // Create a list of requests
    const { items } = getResponse;
    const sections = items.length > 0
      ? getResponse.items.sort((a, b) => {
        const d1 = new Date(a.start_date);
        const d2 = new Date(b.start_date);
        return d1 < d2 ? -1 : 1;
      }).flatMap((req) => {
        let status = ":black_square_for_stop:";
        if (req.approved) status = ":white_check_mark:";
        else if (req.approved !== undefined) status = ":x:";

        const deleteButton = {
          type: "button",
          text: {
            type: "plain_text",
            text: "Delete",
            emoji: true,
          },
          value: req.request_id,
          action_id: "delete_request",
        };

        if (req.reason) {
          return [{
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${status}  ${req.start_date} - ${req.end_date}`,
            },
            accessory: deleteButton,
          }, {
            type: "context",
            elements: [{
              type: "plain_text",
              text: req.reason,
              emoji: true,
            }],
          }];
        }

        // Requests without a reason
        return [{
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${status}  ${req.start_date} - ${req.end_date}`,
          },
          accessory: deleteButton,
        }];
      })
      : [{
        type: "section",
        text: {
          type: "mrkdwn",
          text: `No FTO requests have been created for <@${employee}>`,
        },
      }];

    if (items.length > 0) {
      sections.unshift({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `FTO requests for <@${employee}>`,
        },
      });
    }

    // Display a modal with requests to the searcher
    const modal = await client.views.open({
      interactivity_pointer: inputs.interactivity.interactivity_pointer,
      view: {
        type: "modal",
        title: {
          type: "plain_text",
          text: "View FTO requests",
        },
        blocks: sections,
        callback_id: "view_fto_requests",
      },
    });

    if (!modal.ok) {
      return { error: `Failed to open modal: ${modal.error}` };
    }

    return { completed: false };
  },
);
