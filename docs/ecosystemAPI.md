info:
  title: Fortnite Data API
  version: 1.0.0
  description: |
    <b>A public API to retrieve a list of Fortnite islands and their corresponding engagement metrics.</b>
    <br>
    <br>
    <br>
    Usage Notes / Limitations:
    * Historical data is limited to 7 days
    * Only data for public and discoverable Fortnite islands are available.
    * Islands need at least 5 unique players for the specified time interval for data to appear—otherwise, you'll get a null value.
    * Favorites and recommendations are not supported for some Epic-made games, so these fields will return 0.

openapi: 3.1.1
servers:
  - url: https://api.fortnite.com/ecosystem/v1
  - url: /ecosystem/v1
tags:
  - name: Islands
paths:
  /islands:
    get:
      description: |
        Retrieves a sorted list of islands. The islands returned are sorted by initial release date in with newest releases first.
      tags:
        - Islands
      parameters:
        - $ref: '#/components/parameters/AfterQuery'
        - $ref: '#/components/parameters/BeforeQuery'
        - $ref: '#/components/parameters/SizeQuery'
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/IslandResponse'

  /islands/{code}:
    get:
      description: |
        Retrieves metadata for an island code.
      tags:
        - Islands
      parameters:
        - $ref: '#/components/parameters/IslandCodePath'
      responses:
        '404':
          description: The island with the specified code was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/IslandMetadataSummary'

  /islands/{code}/metrics:
    get:
      description: |
        Retrieves usage metrics for an island code with a bucket interval size of days.
      tags:
        - Islands
      parameters:
        - $ref: '#/components/parameters/IslandCodePath'
        - $ref: '#/components/parameters/FromQuery'
        - $ref: '#/components/parameters/ToQuery'
      responses:
        '400':
          description: The input parameters were invalid.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '404':
          description: The island with the specified code was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          description: Rate limit exceeded. Please try again later.
          content:
            text/plain:
              schema:
                type: string
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/IslandMetricsResponse'

  /islands/{code}/metrics/{interval}:
    get:
      description: |
        Retrieves usage metrics for an island code with buckets at the specified interval.
        * Retention is only available for day intervals and will be excluded from hour and minute intervals.
        * Average minutes per player is only available for day and hour intervals and will be excluded from minute intervals.
      tags:
        - Islands
      parameters:
        - $ref: '#/components/parameters/IslandCodePath'
        - $ref: '#/components/parameters/IntervalPath'
        - $ref: '#/components/parameters/MetricsListQuery'
        - $ref: '#/components/parameters/FromQuery'
        - $ref: '#/components/parameters/ToQuery'
      responses:
        '400':
          description: The input parameters were invalid.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '404':
          description: The island with the specified code was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          description: Rate limit exceeded. Please try again later.
          content:
            text/plain:
              schema:
                type: string
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/FilterableIslandMetricsResponse'

  /islands/{code}/metrics/{interval}/peak-ccu:
    get:
      description: |
        Retrieves the number of peak concurrent players playing the island.
      tags:
        - Islands
      parameters:
        - $ref: '#/components/parameters/IslandCodePath'
        - $ref: '#/components/parameters/IntervalPath'
        - $ref: '#/components/parameters/FromQuery'
        - $ref: '#/components/parameters/ToQuery'
      responses:
        '400':
          description: The input parameters were invalid.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '404':
          description: The island with the specified code was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          description: Rate limit exceeded. Please try again later.
          content:
            text/plain:
              schema:
                type: string
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MetricResponse'

  /islands/{code}/metrics/{interval}/favorites:
    get:
      description: |
        Retrieves the number of times the island was added to a player's favorites during the interval.
      tags:
        - Islands
      parameters:
        - $ref: '#/components/parameters/IslandCodePath'
        - $ref: '#/components/parameters/IntervalPath'
        - $ref: '#/components/parameters/FromQuery'
        - $ref: '#/components/parameters/ToQuery'
      responses:
        '400':
          description: The input parameters were invalid.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '404':
          description: The island with the specified code was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          description: Rate limit exceeded. Please try again later.
          content:
            text/plain:
              schema:
                type: string
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MetricResponse'

  /islands/{code}/metrics/{interval}/minutes-played:
    get:
      description: |
        Retrieves the total amount of time in minutes that players spent playing the island.
      tags:
        - Islands
      parameters:
        - $ref: '#/components/parameters/IslandCodePath'
        - $ref: '#/components/parameters/IntervalPath'
        - $ref: '#/components/parameters/FromQuery'
        - $ref: '#/components/parameters/ToQuery'
      responses:
        '400':
          description: The input parameters were invalid.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '404':
          description: The island with the specified code was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          description: Rate limit exceeded. Please try again later.
          content:
            text/plain:
              schema:
                type: string
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MetricResponse'

  /islands/{code}/metrics/{interval}/average-minutes-per-player:
    get:
      description: |
        Retrieves the average amount of time in minutes that players spent playing the island.
        Average minutes per player is only available for day intervals. Requests for Average minutes per player for hour or minute interval will result in a 404 not found response.
      tags:
        - Islands
      parameters:
        - $ref: '#/components/parameters/IslandCodePath'
        - $ref: '#/components/parameters/IntervalPath'
        - $ref: '#/components/parameters/FromQuery'
        - $ref: '#/components/parameters/ToQuery'
      responses:
        '400':
          description: The input parameters were invalid.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '404':
          description: The island with the specified code was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          description: Rate limit exceeded. Please try again later.
          content:
            text/plain:
              schema:
                type: string
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MetricResponse'

  /islands/{code}/metrics/{interval}/recommendations:
    get:
      description: |
        Retrieves the number of times the island was recommended by a player.
      tags:
        - Islands
      parameters:
        - $ref: '#/components/parameters/IslandCodePath'
        - $ref: '#/components/parameters/IntervalPath'
        - $ref: '#/components/parameters/FromQuery'
        - $ref: '#/components/parameters/ToQuery'
      responses:
        '400':
          description: The input parameters were invalid.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '404':
          description: The island with the specified code was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          description: Rate limit exceeded. Please try again later.
          content:
            text/plain:
              schema:
                type: string
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MetricResponse'

  /islands/{code}/metrics/{interval}/unique-players:
    get:
      description: |
        Retrieves the number of unique players playing the island in the time period.
      tags:
        - Islands
      parameters:
        - $ref: '#/components/parameters/IslandCodePath'
        - $ref: '#/components/parameters/IntervalPath'
        - $ref: '#/components/parameters/FromQuery'
        - $ref: '#/components/parameters/ToQuery'
      responses:
        '400':
          description: The input parameters were invalid.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '404':
          description: The island with the specified code was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          description: Rate limit exceeded. Please try again later.
          content:
            text/plain:
              schema:
                type: string
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MetricResponse'

  /islands/{code}/metrics/{interval}/plays:
    get:
      description: |
        Retrieves the number of times players started to play an island in time period. If a player started an island session multiple times during the time period, each play is counted.
      tags:
        - Islands
      parameters:
        - $ref: '#/components/parameters/IslandCodePath'
        - $ref: '#/components/parameters/IntervalPath'
        - $ref: '#/components/parameters/FromQuery'
        - $ref: '#/components/parameters/ToQuery'
      responses:
        '400':
          description: The input parameters were invalid.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '404':
          description: The island with the specified code was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          description: Rate limit exceeded. Please try again later.
          content:
            text/plain:
              schema:
                type: string
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MetricResponse'

  /islands/{code}/metrics/{interval}/retention:
    get:
      description: |
        Retrieves the number of users the island retained over the last 7 days and 1 day.
        * Retention is only available for day intervals. Requests for retention for an hour or minute interval will result in a 404 not found response.
      tags:
        - Islands
      parameters:
        - $ref: '#/components/parameters/IslandCodePath'
        - $ref: '#/components/parameters/IntervalPath'
        - $ref: '#/components/parameters/FromQuery'
        - $ref: '#/components/parameters/ToQuery'
      responses:
        '400':
          description: The input parameters were invalid.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '404':
          description: The island with the specified code was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          description: Rate limit exceeded. Please try again later.
          content:
            text/plain:
              schema:
                type: string
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/RetentionResponse'

components:
  parameters:
    AfterQuery:
      schema:
        type: string
      required: false
      name: after
      description: |
        Results use cursor-based pagination in order to retrieve the list in batches. To retrieve a cursor position to use,
        first make a request with these fields unspecified. You'll then find cursor values in the response.
        <br>
        <br>
        Returns the results after the specified cursor position.
      in: query
    BeforeQuery:
      schema:
        type: string
      required: false
      name: before
      description: Returns the results before the specified cursor position.
      in: query
    FromQuery:
      schema:
        type: string
        format: date-time
      required: false
      name: from
      description: |
        * Example: 2025-04-29T00:00:00.000Z
        <br>
        <br>
        * Specifies the start of the date range. The `from` is inclusive, meaning the given date/time will
        be included in the results.
        <br>
        * When the interval is days, the default is the beginning of the previous day. When the interval is hours, 
        the default is `now - 24 hours`. When the interval is minutes, the default is `now - 60 minutes`.
      in: query
    IslandCodePath:
      schema:
        type: string
      required: true
      name: code
      description: A valid island code.
      in: path
    MetricsListQuery:
      style: form
      explode: true
      schema:
        type: array
        items:
          type: string
          enum:
            - averageMinutesPerPlayer
            - peakCCU
            - favorites
            - minutesPlayed
            - recommendations
            - plays
            - uniquePlayers
            - retention
      required: false
      name: metrics
      description: Metrics to include in the response. May be specified multiple times.
      in: query
    IntervalPath:
      schema:
        type: string
        enum: ['day', 'hour', 'minute']
      required: true
      name: interval
      description: |
        The size of the interval buckets returned. When the intervals are minutes, the interval buckets will be returned
        at every 10 minute interval.
      in: path
    SizeQuery:
      schema:
        type: number
        default: 100
        minimum: 1
        maximum: 1000
      required: false
      name: size
      description: The maximum number of results to return.
      in: query
    ToQuery:
      schema:
        type: string
        format: date-time
      required: false
      name: to
      description: |
        * Example: 2025-04-30T00:00:00.000Z
        <br>
        <br>
        * Specifies the end of the date range. The `to` is exclusive, meaning the given date/time will not
        be included in the results.
      in: query

  schemas:
    ErrorResponse:
      type: object
      required:
        - errorCode
        - errorMessage
        - uuid
      properties:
        errorCode:
          type: string
          description: A programmatic error code.
          example: errors.com.epicgames.not_found
        errorMessage:
          type: string
          description: A human readable version of the error reason.
        uuid:
          type: string
          format: uuid
          description: The unique identifier for the error event.

    IslandResponse:
      type: object
      required:
        - data
        - links
        - meta
      properties:
        links:
          $ref: '#/components/schemas/PaginationLinks'
        meta:
          $ref: '#/components/schemas/PaginationMetadata'
        data:
          type: array
          items:
            $ref: '#/components/schemas/PaginatedIslandMetadataSummary'

    PaginatedIslandMetadataSummary:
      type: object
      allOf:
        - $ref: '#/components/schemas/IslandMetadataSummary'
        - $ref: '#/components/schemas/IslandPaginationMetadata'

    IslandPaginationMetadata:
      type: object
      required:
        - meta
      properties:
        meta:
          type: object
          required:
            - page
          properties:
            page:
              type: object
              required:
                - cursor
              properties:
                cursor:
                  type: string
                  description: Cursor identifier for this record to use with pagination. Can be passed as the value for the "before" or "after" cursor query parameters.
                  example: c2V0X2JyX3BsYXlsaXN0cw==

    IslandMetadataSummary:
      type: object
      required:
        - code
        - title
        - type
        - tags
      properties:
        code:
          type: string
          description: The island's code.
          example: '1234-1234-1234'
        creatorCode:
          type: string
          description: The island creator's code.
          example: 'fortnite'
        displayName:
          type: string
          description: |
            A friendly name that is used to refer to Epic first party playlist codes. 
            The display name can be used in place of the island playlist code any place in the API that takes an island code parameter.
          example: 'battle-royale'
        title:
          type: string
          description: The island's title.
          example: 'Fortnite Island'
        category:
          type: string
          description: 'Island category which for islands utilizing a brand will be the brand code.'
          example: 'LEGO'
        createdIn:
          type: string
          description: 'How the island was authored.'
          example: 'UEFN'
        tags:
          type: array
          description: 'A list of tags a creator has attributed to their island (ex: 1v1).'
          items:
            type: string
            example: '1v1'

    IslandMetricsResponse:
      type: object
      required:
        - averageMinutesPerPlayer
        - peakCCU
        - favorites
        - minutesPlayed
        - recommendations
        - plays
        - uniquePlayers
      properties:
        averageMinutesPerPlayer:
          description: The average amount of time in minutes players spent playing the island.
          $ref: '#/components/schemas/Metrics'
        peakCCU:
          description: The peak number of concurrent players playing the island.
          $ref: '#/components/schemas/Metrics'
        favorites:
          description: The number of times the island was added to a player's favorites.
          $ref: '#/components/schemas/Metrics'
        minutesPlayed:
          description: The total amount of time in minutes players spent playing the island.
          $ref: '#/components/schemas/Metrics'
        recommendations:
          description: The number of times the island was recommended by a player.
          $ref: '#/components/schemas/Metrics'
        retention:
          description: The user retention data for the island during the time period.
          type: array
          items:
            $ref: '#/components/schemas/Retention'

        plays:
          description: |
            The number of unique plays the island had during the time period. A player playing multiple times during the
            time period would count as a unique play each time.
          $ref: '#/components/schemas/Metrics'
        uniquePlayers:
          description: The number of unique players playing the island.
          $ref: '#/components/schemas/Metrics'

    FilterableIslandMetricsResponse:
      type: object
      properties:
        averageMinutesPerPlayer:
          description: The average amount of time in minutes players spent playing the island.
          $ref: '#/components/schemas/Metrics'
        peakCCU:
          description: The peak number of concurrent players playing the island.
          $ref: '#/components/schemas/Metrics'
        favorites:
          description: The number of times the island was added to a player's favorites.
          $ref: '#/components/schemas/Metrics'
        minutesPlayed:
          description: The total amount of time in minutes players spent playing the island.
          $ref: '#/components/schemas/Metrics'
        recommendations:
          description: The number of times the island was recommended by a player.
          $ref: '#/components/schemas/Metrics'
        retention:
          description: The user retention data for the island during the time period.
          type: array
          items:
            $ref: '#/components/schemas/Retention'
        plays:
          description: |
            The number of unique plays the island had during the time period. A player playing multiple times during the
            time period would count as a unique play each time.
          $ref: '#/components/schemas/Metrics'
        uniquePlayers:
          description: The number of unique players playing the island.
          $ref: '#/components/schemas/Metrics'

    MetricResponse:
      description: |
        The metric values at each time interval for the period.
      type: object
      properties:
        intervals:
          type: array
          items:
            $ref: '#/components/schemas/MetricValue'

    Metrics:
      description: |
        The metric values at each time interval for the period.
      type: array
      items:
        $ref: '#/components/schemas/MetricValue'

    MetricValue:
      description: A metric value and the interval date/time.
      properties:
        value:
          type:
            - number
            - 'null'
          description: The value of the metric, a null value means no data is present for that interval.
          example: 50
        timestamp:
          type: string
          description: The date/time of the interval.
          format: date-time
          example: '2025-06-01T01:20:00.000Z'

    PaginationLinks:
      type: object
      properties:
        prev:
          type:
            - string
            - 'null'
          format: url
          description: Path to the previous page of results if a previous page is available. Will be null when no previous pages are available.
          example: /ecosystem/v1/islands?size=100&before=c2V0X2JyX3BsYXlsaXN0cw==
        next:
          type:
            - string
            - 'null'
          format: url
          description: Path to the next page of results if another page is available. Will be null when no more pages available.
          example: /ecosystem/v1/islands?size=100&after=c2V0X2JyX3BsYXlsaXN0cw==

    PaginationMetadata:
      type: object
      required:
        - count
        - page
      properties:
        count:
          type: number
          description: The number of results being returned.
          example: 100
        page:
          type: object
          properties:
            prevCursor:
              type:
                - string
                - 'null'
              description: The pagination cursor used to request the previous page of results. Will be null when no previous pages available.
              example: c2V0X2JyX3BsYXlsaXN0cw==
            nextCursor:
              type:
                - string
                - 'null'
              description: The pagination cursor used to request the next page of results. Will be null when no more pages available.
              example: c2V0X2JyX3BsYXlsaXN0cw==

    RetentionResponse:
      description: |
        The retention values at each time interval for the period.
      type: object
      properties:
        intervals:
          type: array
          items:
            $ref: '#/components/schemas/Retention'

    Retention:
      type: object
      properties:
        d1:
          type:
            - number
            - 'null'
          description: The number of players retained in from the previous day.
        d7:
          type:
            - number
            - 'null'
          description: The number of players retained from the previous 7 days.
        timestamp:
          type: string
          description: The date/time of the interval.
          format: date-time
          example: '2025-06-01T01:20:00.000Z'

  securitySchemes:
    Auth:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: https://api.epicgames.dev/epic/oauth/v1/token
          scopes: {}