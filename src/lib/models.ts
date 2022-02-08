/**
 * This file was auto-generated by openapi-typescript.
 * Do not make direct changes to the file.
 */

export interface paths {
  "/": {
    get: {
      responses: {
        /** OK */
        200: unknown;
      };
    };
  };
  "/families": {
    get: {
      parameters: {
        query: {
          id?: parameters["rowFilter.families.id"];
          created_at?: parameters["rowFilter.families.created_at"];
          name?: parameters["rowFilter.families.name"];
          creator_id?: parameters["rowFilter.families.creator_id"];
          /** Filtering Columns */
          select?: parameters["select"];
          /** Ordering */
          order?: parameters["order"];
          /** Limiting and Pagination */
          offset?: parameters["offset"];
          /** Limiting and Pagination */
          limit?: parameters["limit"];
        };
        header: {
          /** Limiting and Pagination */
          Range?: parameters["range"];
          /** Limiting and Pagination */
          "Range-Unit"?: parameters["rangeUnit"];
          /** Preference */
          Prefer?: parameters["preferCount"];
        };
      };
      responses: {
        /** OK */
        200: {
          schema: definitions["families"][];
        };
        /** Partial Content */
        206: unknown;
      };
    };
    post: {
      parameters: {
        body: {
          /** families */
          families?: definitions["families"];
        };
        query: {
          /** Filtering Columns */
          select?: parameters["select"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** Created */
        201: unknown;
      };
    };
    delete: {
      parameters: {
        query: {
          id?: parameters["rowFilter.families.id"];
          created_at?: parameters["rowFilter.families.created_at"];
          name?: parameters["rowFilter.families.name"];
          creator_id?: parameters["rowFilter.families.creator_id"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
    patch: {
      parameters: {
        query: {
          id?: parameters["rowFilter.families.id"];
          created_at?: parameters["rowFilter.families.created_at"];
          name?: parameters["rowFilter.families.name"];
          creator_id?: parameters["rowFilter.families.creator_id"];
        };
        body: {
          /** families */
          families?: definitions["families"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
  };
  "/lunch_proposal": {
    get: {
      parameters: {
        query: {
          id?: parameters["rowFilter.lunch_proposal.id"];
          created_at?: parameters["rowFilter.lunch_proposal.created_at"];
          user_id?: parameters["rowFilter.lunch_proposal.user_id"];
          meal_id?: parameters["rowFilter.lunch_proposal.meal_id"];
          lunch_id?: parameters["rowFilter.lunch_proposal.lunch_id"];
          family_id?: parameters["rowFilter.lunch_proposal.family_id"];
          /** Filtering Columns */
          select?: parameters["select"];
          /** Ordering */
          order?: parameters["order"];
          /** Limiting and Pagination */
          offset?: parameters["offset"];
          /** Limiting and Pagination */
          limit?: parameters["limit"];
        };
        header: {
          /** Limiting and Pagination */
          Range?: parameters["range"];
          /** Limiting and Pagination */
          "Range-Unit"?: parameters["rangeUnit"];
          /** Preference */
          Prefer?: parameters["preferCount"];
        };
      };
      responses: {
        /** OK */
        200: {
          schema: definitions["lunch_proposal"][];
        };
        /** Partial Content */
        206: unknown;
      };
    };
    post: {
      parameters: {
        body: {
          /** lunch_proposal */
          lunch_proposal?: definitions["lunch_proposal"];
        };
        query: {
          /** Filtering Columns */
          select?: parameters["select"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** Created */
        201: unknown;
      };
    };
    delete: {
      parameters: {
        query: {
          id?: parameters["rowFilter.lunch_proposal.id"];
          created_at?: parameters["rowFilter.lunch_proposal.created_at"];
          user_id?: parameters["rowFilter.lunch_proposal.user_id"];
          meal_id?: parameters["rowFilter.lunch_proposal.meal_id"];
          lunch_id?: parameters["rowFilter.lunch_proposal.lunch_id"];
          family_id?: parameters["rowFilter.lunch_proposal.family_id"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
    patch: {
      parameters: {
        query: {
          id?: parameters["rowFilter.lunch_proposal.id"];
          created_at?: parameters["rowFilter.lunch_proposal.created_at"];
          user_id?: parameters["rowFilter.lunch_proposal.user_id"];
          meal_id?: parameters["rowFilter.lunch_proposal.meal_id"];
          lunch_id?: parameters["rowFilter.lunch_proposal.lunch_id"];
          family_id?: parameters["rowFilter.lunch_proposal.family_id"];
        };
        body: {
          /** lunch_proposal */
          lunch_proposal?: definitions["lunch_proposal"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
  };
  "/lunch_proposal_comments": {
    get: {
      parameters: {
        query: {
          id?: parameters["rowFilter.lunch_proposal_comments.id"];
          created_at?: parameters["rowFilter.lunch_proposal_comments.created_at"];
          family_id?: parameters["rowFilter.lunch_proposal_comments.family_id"];
          user_id?: parameters["rowFilter.lunch_proposal_comments.user_id"];
          lunch_proposal_id?: parameters["rowFilter.lunch_proposal_comments.lunch_proposal_id"];
          text?: parameters["rowFilter.lunch_proposal_comments.text"];
          /** Filtering Columns */
          select?: parameters["select"];
          /** Ordering */
          order?: parameters["order"];
          /** Limiting and Pagination */
          offset?: parameters["offset"];
          /** Limiting and Pagination */
          limit?: parameters["limit"];
        };
        header: {
          /** Limiting and Pagination */
          Range?: parameters["range"];
          /** Limiting and Pagination */
          "Range-Unit"?: parameters["rangeUnit"];
          /** Preference */
          Prefer?: parameters["preferCount"];
        };
      };
      responses: {
        /** OK */
        200: {
          schema: definitions["lunch_proposal_comments"][];
        };
        /** Partial Content */
        206: unknown;
      };
    };
    post: {
      parameters: {
        body: {
          /** lunch_proposal_comments */
          lunch_proposal_comments?: definitions["lunch_proposal_comments"];
        };
        query: {
          /** Filtering Columns */
          select?: parameters["select"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** Created */
        201: unknown;
      };
    };
    delete: {
      parameters: {
        query: {
          id?: parameters["rowFilter.lunch_proposal_comments.id"];
          created_at?: parameters["rowFilter.lunch_proposal_comments.created_at"];
          family_id?: parameters["rowFilter.lunch_proposal_comments.family_id"];
          user_id?: parameters["rowFilter.lunch_proposal_comments.user_id"];
          lunch_proposal_id?: parameters["rowFilter.lunch_proposal_comments.lunch_proposal_id"];
          text?: parameters["rowFilter.lunch_proposal_comments.text"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
    patch: {
      parameters: {
        query: {
          id?: parameters["rowFilter.lunch_proposal_comments.id"];
          created_at?: parameters["rowFilter.lunch_proposal_comments.created_at"];
          family_id?: parameters["rowFilter.lunch_proposal_comments.family_id"];
          user_id?: parameters["rowFilter.lunch_proposal_comments.user_id"];
          lunch_proposal_id?: parameters["rowFilter.lunch_proposal_comments.lunch_proposal_id"];
          text?: parameters["rowFilter.lunch_proposal_comments.text"];
        };
        body: {
          /** lunch_proposal_comments */
          lunch_proposal_comments?: definitions["lunch_proposal_comments"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
  };
  "/lunch_proposal_vote": {
    get: {
      parameters: {
        query: {
          id?: parameters["rowFilter.lunch_proposal_vote.id"];
          created_at?: parameters["rowFilter.lunch_proposal_vote.created_at"];
          user_id?: parameters["rowFilter.lunch_proposal_vote.user_id"];
          family_id?: parameters["rowFilter.lunch_proposal_vote.family_id"];
          lunch_proposal_id?: parameters["rowFilter.lunch_proposal_vote.lunch_proposal_id"];
          /** Filtering Columns */
          select?: parameters["select"];
          /** Ordering */
          order?: parameters["order"];
          /** Limiting and Pagination */
          offset?: parameters["offset"];
          /** Limiting and Pagination */
          limit?: parameters["limit"];
        };
        header: {
          /** Limiting and Pagination */
          Range?: parameters["range"];
          /** Limiting and Pagination */
          "Range-Unit"?: parameters["rangeUnit"];
          /** Preference */
          Prefer?: parameters["preferCount"];
        };
      };
      responses: {
        /** OK */
        200: {
          schema: definitions["lunch_proposal_vote"][];
        };
        /** Partial Content */
        206: unknown;
      };
    };
    post: {
      parameters: {
        body: {
          /** lunch_proposal_vote */
          lunch_proposal_vote?: definitions["lunch_proposal_vote"];
        };
        query: {
          /** Filtering Columns */
          select?: parameters["select"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** Created */
        201: unknown;
      };
    };
    delete: {
      parameters: {
        query: {
          id?: parameters["rowFilter.lunch_proposal_vote.id"];
          created_at?: parameters["rowFilter.lunch_proposal_vote.created_at"];
          user_id?: parameters["rowFilter.lunch_proposal_vote.user_id"];
          family_id?: parameters["rowFilter.lunch_proposal_vote.family_id"];
          lunch_proposal_id?: parameters["rowFilter.lunch_proposal_vote.lunch_proposal_id"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
    patch: {
      parameters: {
        query: {
          id?: parameters["rowFilter.lunch_proposal_vote.id"];
          created_at?: parameters["rowFilter.lunch_proposal_vote.created_at"];
          user_id?: parameters["rowFilter.lunch_proposal_vote.user_id"];
          family_id?: parameters["rowFilter.lunch_proposal_vote.family_id"];
          lunch_proposal_id?: parameters["rowFilter.lunch_proposal_vote.lunch_proposal_id"];
        };
        body: {
          /** lunch_proposal_vote */
          lunch_proposal_vote?: definitions["lunch_proposal_vote"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
  };
  "/lunchs": {
    get: {
      parameters: {
        query: {
          id?: parameters["rowFilter.lunchs.id"];
          created_at?: parameters["rowFilter.lunchs.created_at"];
          created_by?: parameters["rowFilter.lunchs.created_by"];
          cook_id?: parameters["rowFilter.lunchs.cook_id"];
          selected_lunch_vote_id?: parameters["rowFilter.lunchs.selected_lunch_vote_id"];
          family_id?: parameters["rowFilter.lunchs.family_id"];
          /** Filtering Columns */
          select?: parameters["select"];
          /** Ordering */
          order?: parameters["order"];
          /** Limiting and Pagination */
          offset?: parameters["offset"];
          /** Limiting and Pagination */
          limit?: parameters["limit"];
        };
        header: {
          /** Limiting and Pagination */
          Range?: parameters["range"];
          /** Limiting and Pagination */
          "Range-Unit"?: parameters["rangeUnit"];
          /** Preference */
          Prefer?: parameters["preferCount"];
        };
      };
      responses: {
        /** OK */
        200: {
          schema: definitions["lunchs"][];
        };
        /** Partial Content */
        206: unknown;
      };
    };
    post: {
      parameters: {
        body: {
          /** lunchs */
          lunchs?: definitions["lunchs"];
        };
        query: {
          /** Filtering Columns */
          select?: parameters["select"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** Created */
        201: unknown;
      };
    };
    delete: {
      parameters: {
        query: {
          id?: parameters["rowFilter.lunchs.id"];
          created_at?: parameters["rowFilter.lunchs.created_at"];
          created_by?: parameters["rowFilter.lunchs.created_by"];
          cook_id?: parameters["rowFilter.lunchs.cook_id"];
          selected_lunch_vote_id?: parameters["rowFilter.lunchs.selected_lunch_vote_id"];
          family_id?: parameters["rowFilter.lunchs.family_id"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
    patch: {
      parameters: {
        query: {
          id?: parameters["rowFilter.lunchs.id"];
          created_at?: parameters["rowFilter.lunchs.created_at"];
          created_by?: parameters["rowFilter.lunchs.created_by"];
          cook_id?: parameters["rowFilter.lunchs.cook_id"];
          selected_lunch_vote_id?: parameters["rowFilter.lunchs.selected_lunch_vote_id"];
          family_id?: parameters["rowFilter.lunchs.family_id"];
        };
        body: {
          /** lunchs */
          lunchs?: definitions["lunchs"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
  };
  "/meals": {
    get: {
      parameters: {
        query: {
          id?: parameters["rowFilter.meals.id"];
          created_at?: parameters["rowFilter.meals.created_at"];
          created_by?: parameters["rowFilter.meals.created_by"];
          name?: parameters["rowFilter.meals.name"];
          family_id?: parameters["rowFilter.meals.family_id"];
          /** Filtering Columns */
          select?: parameters["select"];
          /** Ordering */
          order?: parameters["order"];
          /** Limiting and Pagination */
          offset?: parameters["offset"];
          /** Limiting and Pagination */
          limit?: parameters["limit"];
        };
        header: {
          /** Limiting and Pagination */
          Range?: parameters["range"];
          /** Limiting and Pagination */
          "Range-Unit"?: parameters["rangeUnit"];
          /** Preference */
          Prefer?: parameters["preferCount"];
        };
      };
      responses: {
        /** OK */
        200: {
          schema: definitions["meals"][];
        };
        /** Partial Content */
        206: unknown;
      };
    };
    post: {
      parameters: {
        body: {
          /** meals */
          meals?: definitions["meals"];
        };
        query: {
          /** Filtering Columns */
          select?: parameters["select"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** Created */
        201: unknown;
      };
    };
    delete: {
      parameters: {
        query: {
          id?: parameters["rowFilter.meals.id"];
          created_at?: parameters["rowFilter.meals.created_at"];
          created_by?: parameters["rowFilter.meals.created_by"];
          name?: parameters["rowFilter.meals.name"];
          family_id?: parameters["rowFilter.meals.family_id"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
    patch: {
      parameters: {
        query: {
          id?: parameters["rowFilter.meals.id"];
          created_at?: parameters["rowFilter.meals.created_at"];
          created_by?: parameters["rowFilter.meals.created_by"];
          name?: parameters["rowFilter.meals.name"];
          family_id?: parameters["rowFilter.meals.family_id"];
        };
        body: {
          /** meals */
          meals?: definitions["meals"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
  };
  "/test": {
    get: {
      parameters: {
        query: {
          id?: parameters["rowFilter.test.id"];
          created_at?: parameters["rowFilter.test.created_at"];
          userID?: parameters["rowFilter.test.userID"];
          /** Filtering Columns */
          select?: parameters["select"];
          /** Ordering */
          order?: parameters["order"];
          /** Limiting and Pagination */
          offset?: parameters["offset"];
          /** Limiting and Pagination */
          limit?: parameters["limit"];
        };
        header: {
          /** Limiting and Pagination */
          Range?: parameters["range"];
          /** Limiting and Pagination */
          "Range-Unit"?: parameters["rangeUnit"];
          /** Preference */
          Prefer?: parameters["preferCount"];
        };
      };
      responses: {
        /** OK */
        200: {
          schema: definitions["test"][];
        };
        /** Partial Content */
        206: unknown;
      };
    };
    post: {
      parameters: {
        body: {
          /** test */
          test?: definitions["test"];
        };
        query: {
          /** Filtering Columns */
          select?: parameters["select"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** Created */
        201: unknown;
      };
    };
    delete: {
      parameters: {
        query: {
          id?: parameters["rowFilter.test.id"];
          created_at?: parameters["rowFilter.test.created_at"];
          userID?: parameters["rowFilter.test.userID"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
    patch: {
      parameters: {
        query: {
          id?: parameters["rowFilter.test.id"];
          created_at?: parameters["rowFilter.test.created_at"];
          userID?: parameters["rowFilter.test.userID"];
        };
        body: {
          /** test */
          test?: definitions["test"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
  };
  "/users_to_families": {
    get: {
      parameters: {
        query: {
          user_id?: parameters["rowFilter.users_to_families.user_id"];
          families_id?: parameters["rowFilter.users_to_families.families_id"];
          name?: parameters["rowFilter.users_to_families.name"];
          /** Filtering Columns */
          select?: parameters["select"];
          /** Ordering */
          order?: parameters["order"];
          /** Limiting and Pagination */
          offset?: parameters["offset"];
          /** Limiting and Pagination */
          limit?: parameters["limit"];
        };
        header: {
          /** Limiting and Pagination */
          Range?: parameters["range"];
          /** Limiting and Pagination */
          "Range-Unit"?: parameters["rangeUnit"];
          /** Preference */
          Prefer?: parameters["preferCount"];
        };
      };
      responses: {
        /** OK */
        200: {
          schema: definitions["users_to_families"][];
        };
        /** Partial Content */
        206: unknown;
      };
    };
    post: {
      parameters: {
        body: {
          /** users_to_families */
          users_to_families?: definitions["users_to_families"];
        };
        query: {
          /** Filtering Columns */
          select?: parameters["select"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** Created */
        201: unknown;
      };
    };
    delete: {
      parameters: {
        query: {
          user_id?: parameters["rowFilter.users_to_families.user_id"];
          families_id?: parameters["rowFilter.users_to_families.families_id"];
          name?: parameters["rowFilter.users_to_families.name"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
    patch: {
      parameters: {
        query: {
          user_id?: parameters["rowFilter.users_to_families.user_id"];
          families_id?: parameters["rowFilter.users_to_families.families_id"];
          name?: parameters["rowFilter.users_to_families.name"];
        };
        body: {
          /** users_to_families */
          users_to_families?: definitions["users_to_families"];
        };
        header: {
          /** Preference */
          Prefer?: parameters["preferReturn"];
        };
      };
      responses: {
        /** No Content */
        204: never;
      };
    };
  };
}

export interface definitions {
  /** @description A family holds multiple people */
  families: {
    /**
     * Format: uuid
     * @description Note:
     * This is a Primary Key.<pk/>
     * @default extensions.uuid_generate_v4()
     */
    id: string;
    /**
     * Format: timestamp with time zone
     * @default now()
     */
    created_at?: string;
    /** Format: text */
    name: string;
    /** Format: uuid */
    creator_id: string;
  };
  /** @description votes for meals */
  lunch_proposal: {
    /**
     * Format: uuid
     * @description Note:
     * This is a Primary Key.<pk/>
     */
    id: string;
    /**
     * Format: timestamp with time zone
     * @default now()
     */
    created_at: string;
    /** Format: uuid */
    user_id: string;
    /**
     * Format: uuid
     * @description Note:
     * This is a Foreign Key to `meals.id`.<fk table='meals' column='id'/>
     */
    meal_id: string;
    /**
     * Format: uuid
     * @description Note:
     * This is a Foreign Key to `lunchs.id`.<fk table='lunchs' column='id'/>
     */
    lunch_id: string;
    /**
     * Format: uuid
     * @description Note:
     * This is a Foreign Key to `families.id`.<fk table='families' column='id'/>
     */
    family_id: string;
  };
  lunch_proposal_comments: {
    /**
     * Format: bigint
     * @description Note:
     * This is a Primary Key.<pk/>
     */
    id: number;
    /**
     * Format: timestamp with time zone
     * @default now()
     */
    created_at: string;
    /**
     * Format: uuid
     * @description Note:
     * This is a Foreign Key to `families.id`.<fk table='families' column='id'/>
     */
    family_id: string;
    /** Format: uuid */
    user_id: string;
    /**
     * Format: uuid
     * @description Note:
     * This is a Foreign Key to `lunch_proposal.id`.<fk table='lunch_proposal' column='id'/>
     */
    lunch_proposal_id: string;
    /** Format: text */
    text: string;
  };
  lunch_proposal_vote: {
    /**
     * Format: uuid
     * @description Note:
     * This is a Primary Key.<pk/>
     * @default extensions.uuid_generate_v4()
     */
    id: string;
    /**
     * Format: timestamp with time zone
     * @default now()
     */
    created_at: string;
    /** Format: uuid */
    user_id: string;
    /**
     * Format: uuid
     * @description Note:
     * This is a Foreign Key to `families.id`.<fk table='families' column='id'/>
     */
    family_id: string;
    /**
     * Format: uuid
     * @description Note:
     * This is a Foreign Key to `lunch_proposal.id`.<fk table='lunch_proposal' column='id'/>
     */
    lunch_proposal_id: string;
  };
  /** @description Daily lunch votes */
  lunchs: {
    /**
     * Format: uuid
     * @description Note:
     * This is a Primary Key.<pk/>
     * @default extensions.uuid_generate_v4()
     */
    id: string;
    /**
     * Format: timestamp without time zone
     * @default (now() AT TIME ZONE 'utc'::text)
     */
    created_at: string;
    /** Format: uuid */
    created_by: string;
    /** Format: uuid */
    cook_id?: string;
    /**
     * Format: uuid
     * @description Note:
     * This is a Foreign Key to `lunch_proposal.id`.<fk table='lunch_proposal' column='id'/>
     */
    selected_lunch_vote_id?: string;
    /**
     * Format: uuid
     * @description Note:
     * This is a Foreign Key to `families.id`.<fk table='families' column='id'/>
     */
    family_id: string;
  };
  meals: {
    /**
     * Format: uuid
     * @description Note:
     * This is a Primary Key.<pk/>
     * @default extensions.uuid_generate_v4()
     */
    id: string;
    /**
     * Format: timestamp with time zone
     * @default now()
     */
    created_at?: string;
    /** Format: uuid */
    created_by: string;
    /** Format: text */
    name: string;
    /**
     * Format: uuid
     * @description Note:
     * This is a Foreign Key to `families.id`.<fk table='families' column='id'/>
     */
    family_id: string;
  };
  test: {
    /**
     * Format: bigint
     * @description Note:
     * This is a Primary Key.<pk/>
     */
    id: number;
    /**
     * Format: timestamp with time zone
     * @default now()
     */
    created_at?: string;
    /** Format: uuid */
    userID?: string;
  };
  users_to_families: {
    /**
     * Format: uuid
     * @description Note:
     * This is a Primary Key.<pk/>
     */
    user_id: string;
    /**
     * Format: uuid
     * @description Note:
     * This is a Foreign Key to `families.id`.<fk table='families' column='id'/>
     */
    families_id: string;
    /** Format: text */
    name?: string;
  };
}

export interface parameters {
  /**
   * @description Preference
   * @enum {string}
   */
  preferParams: "params=single-object";
  /**
   * @description Preference
   * @enum {string}
   */
  preferReturn: "return=representation" | "return=minimal" | "return=none";
  /**
   * @description Preference
   * @enum {string}
   */
  preferCount: "count=none";
  /** @description Filtering Columns */
  select: string;
  /** @description On Conflict */
  on_conflict: string;
  /** @description Ordering */
  order: string;
  /** @description Limiting and Pagination */
  range: string;
  /**
   * @description Limiting and Pagination
   * @default items
   */
  rangeUnit: string;
  /** @description Limiting and Pagination */
  offset: string;
  /** @description Limiting and Pagination */
  limit: string;
  /** @description families */
  "body.families": definitions["families"];
  /** Format: uuid */
  "rowFilter.families.id": string;
  /** Format: timestamp with time zone */
  "rowFilter.families.created_at": string;
  /** Format: text */
  "rowFilter.families.name": string;
  /** Format: uuid */
  "rowFilter.families.creator_id": string;
  /** @description lunch_proposal */
  "body.lunch_proposal": definitions["lunch_proposal"];
  /** Format: uuid */
  "rowFilter.lunch_proposal.id": string;
  /** Format: timestamp with time zone */
  "rowFilter.lunch_proposal.created_at": string;
  /** Format: uuid */
  "rowFilter.lunch_proposal.user_id": string;
  /** Format: uuid */
  "rowFilter.lunch_proposal.meal_id": string;
  /** Format: uuid */
  "rowFilter.lunch_proposal.lunch_id": string;
  /** Format: uuid */
  "rowFilter.lunch_proposal.family_id": string;
  /** @description lunch_proposal_comments */
  "body.lunch_proposal_comments": definitions["lunch_proposal_comments"];
  /** Format: bigint */
  "rowFilter.lunch_proposal_comments.id": string;
  /** Format: timestamp with time zone */
  "rowFilter.lunch_proposal_comments.created_at": string;
  /** Format: uuid */
  "rowFilter.lunch_proposal_comments.family_id": string;
  /** Format: uuid */
  "rowFilter.lunch_proposal_comments.user_id": string;
  /** Format: uuid */
  "rowFilter.lunch_proposal_comments.lunch_proposal_id": string;
  /** Format: text */
  "rowFilter.lunch_proposal_comments.text": string;
  /** @description lunch_proposal_vote */
  "body.lunch_proposal_vote": definitions["lunch_proposal_vote"];
  /** Format: uuid */
  "rowFilter.lunch_proposal_vote.id": string;
  /** Format: timestamp with time zone */
  "rowFilter.lunch_proposal_vote.created_at": string;
  /** Format: uuid */
  "rowFilter.lunch_proposal_vote.user_id": string;
  /** Format: uuid */
  "rowFilter.lunch_proposal_vote.family_id": string;
  /** Format: uuid */
  "rowFilter.lunch_proposal_vote.lunch_proposal_id": string;
  /** @description lunchs */
  "body.lunchs": definitions["lunchs"];
  /** Format: uuid */
  "rowFilter.lunchs.id": string;
  /** Format: timestamp without time zone */
  "rowFilter.lunchs.created_at": string;
  /** Format: uuid */
  "rowFilter.lunchs.created_by": string;
  /** Format: uuid */
  "rowFilter.lunchs.cook_id": string;
  /** Format: uuid */
  "rowFilter.lunchs.selected_lunch_vote_id": string;
  /** Format: uuid */
  "rowFilter.lunchs.family_id": string;
  /** @description meals */
  "body.meals": definitions["meals"];
  /** Format: uuid */
  "rowFilter.meals.id": string;
  /** Format: timestamp with time zone */
  "rowFilter.meals.created_at": string;
  /** Format: uuid */
  "rowFilter.meals.created_by": string;
  /** Format: text */
  "rowFilter.meals.name": string;
  /** Format: uuid */
  "rowFilter.meals.family_id": string;
  /** @description test */
  "body.test": definitions["test"];
  /** Format: bigint */
  "rowFilter.test.id": string;
  /** Format: timestamp with time zone */
  "rowFilter.test.created_at": string;
  /** Format: uuid */
  "rowFilter.test.userID": string;
  /** @description users_to_families */
  "body.users_to_families": definitions["users_to_families"];
  /** Format: uuid */
  "rowFilter.users_to_families.user_id": string;
  /** Format: uuid */
  "rowFilter.users_to_families.families_id": string;
  /** Format: text */
  "rowFilter.users_to_families.name": string;
}

export interface operations {}

export interface external {}
